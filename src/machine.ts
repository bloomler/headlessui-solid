import { DefaultMap } from "./utils/default-map.ts";
import { disposables } from "./utils/disposables.ts";
import { env } from "./utils/env.ts";

type EventSubscriber<State, Event> = (state: State, event: Event) => void;

interface Subscriber<State> {
  selector: (state: Readonly<State>) => unknown;
  callback: (state: unknown) => void;
  current: unknown;
}

export abstract class Machine<
  State,
  Event extends { type: number | string },
> {
  #state: State = {} as State;
  #eventSubscribers = new DefaultMap<
    Event["type"],
    Set<EventSubscriber<State, Event>>
  >(() => new Set());
  #subscribers: Set<Subscriber<State>> = new Set();

  disposables = disposables();

  constructor(initialState: State) {
    this.#state = initialState;

    if (env.isServer) {
      // Cleanup any disposables that were registered on the server-side
      this.disposables.microTask(() => {
        this.dispose();
      });
    }
  }

  dispose() {
    this.disposables.dispose();
  }

  get state(): Readonly<State> {
    return this.#state;
  }

  abstract reduce(state: Readonly<State>, event: Event): Readonly<State>;

  subscribe<Slice>(
    selector: (state: Readonly<State>) => Slice,
    callback: (state: Slice) => void,
  ): () => void {
    if (env.isServer) return () => {};

    const subscriber: Subscriber<State> = {
      selector,
      callback: (state) => callback(state as Slice),
      current: selector(this.#state),
    };
    this.#subscribers.add(subscriber);

    return this.disposables.add(() => {
      this.#subscribers.delete(subscriber);
    });
  }

  on<T extends Event["type"]>(
    type: T,
    callback: (state: State, event: Extract<Event, { type: T }>) => void,
  ) {
    if (env.isServer) return () => {};

    const eventSubscriber: EventSubscriber<State, Event> = (state, event) => {
      callback(state, event as Extract<Event, { type: T }>);
    };
    this.#eventSubscribers.get(type).add(eventSubscriber);
    return this.disposables.add(() => {
      this.#eventSubscribers.get(type).delete(eventSubscriber);
    });
  }

  send(event: Event) {
    const newState = this.reduce(this.#state, event);
    if (newState === this.#state) return; // No change

    this.#state = newState;

    for (const subscriber of this.#subscribers) {
      const slice = subscriber.selector(this.#state);
      if (shallowEqual(subscriber.current, slice)) continue;

      subscriber.current = slice;
      subscriber.callback(slice);
    }

    for (const callback of this.#eventSubscribers.get(event.type)) {
      callback(this.#state, event);
    }
  }
}

export function shallowEqual(a: unknown, b: unknown): boolean {
  // Exact same reference
  if (Object.is(a, b)) return true;

  // Must be some type of object
  if (
    typeof a !== "object" || a === null || typeof b !== "object" ||
    b === null
  ) return false;

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return compareEntries(a[Symbol.iterator](), b[Symbol.iterator]());
  }

  // Map and Set
  if (
    (a instanceof Map && b instanceof Map) ||
    (a instanceof Set && b instanceof Set)
  ) {
    if (a.size !== b.size) return false;
    return compareEntries(a.entries(), b.entries());
  }

  // Plain objects
  if (isPlainObject(a) && isPlainObject(b)) {
    return compareEntries(
      Object.entries(a)[Symbol.iterator](),
      Object.entries(b)[Symbol.iterator](),
    );
  }

  // Treat non-plain objects as opaque values. Equal references were handled
  // above; different instances must remain observably different.
  return false;
}

function compareEntries(
  a: IterableIterator<unknown>,
  b: IterableIterator<unknown>,
): boolean {
  do {
    const aResult = a.next();
    const bResult = b.next();

    if (aResult.done && bResult.done) return true;
    if (aResult.done || bResult.done) return false;

    if (!Object.is(aResult.value, bResult.value)) return false;
  } while (true);
}

function isPlainObject<T extends object>(
  value: T,
): value is T & Record<keyof T, unknown> {
  if (Object.prototype.toString.call(value) !== "[object Object]") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

export function batch<
  F extends (...args: never[]) => void,
  P extends unknown[] = Parameters<F>,
>(
  setup: () => [callback: F, handle: () => void],
) {
  const [callback, handle] = setup();
  const d = disposables();
  return (...args: P) => {
    Reflect.apply(callback, undefined, args);
    d.dispose();
    d.microTask(handle);
  };
}
