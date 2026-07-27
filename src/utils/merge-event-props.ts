import { $PROXY, untrack } from "solid-js";

export type AnyProps = Record<string, unknown>;

type EventArguments = readonly unknown[];
type EventHandler = (...args: never[]) => unknown;
type BoundEventHandler = readonly [
  (data: unknown, ...args: never[]) => unknown,
  unknown,
];
type EventLike = {
  readonly defaultPrevented: boolean;
  preventDefault(): void;
};

function isEventProperty(property: PropertyKey): property is string {
  return typeof property === "string" && /^on[A-Z]/.test(property);
}

function isBoundEventHandler(value: unknown): value is BoundEventHandler {
  return Array.isArray(value) && value.length === 2 &&
    typeof value[0] === "function";
}

function isEventLike(value: unknown): value is EventLike {
  return typeof value === "object" && value !== null &&
    typeof Reflect.get(value, "defaultPrevented") === "boolean" &&
    typeof Reflect.get(value, "preventDefault") === "function";
}

function invokeEventHandler(handler: unknown, args: EventArguments): void {
  if (typeof handler === "function") {
    Reflect.apply(handler as EventHandler, undefined, args);
  } else if (isBoundEventHandler(handler)) {
    Reflect.apply(handler[0], undefined, [handler[1], ...args]);
  }
}

function shouldBlockDisabledEvent(eventName: string): boolean {
  return /^(on(?:Click|Pointer|Mouse|Key)(?:Down|Up|Press)?)$/.test(eventName);
}

function isAriaDisabled(value: unknown): boolean {
  return value === true || value === "true";
}

function isMergeSource(property: PropertyKey): boolean {
  return typeof property === "symbol" &&
    property.description === "MERGE_SOURCE";
}

function findSource(
  sources: readonly AnyProps[],
  property: PropertyKey,
): AnyProps | undefined {
  for (let index = sources.length - 1; index >= 0; index--) {
    const source = sources[index];
    if (property in source) return source;
  }
}

/**
 * Reactively merges props while preserving Headless UI's event ordering:
 * consumer handlers run first and `preventDefault()` cancels later handlers.
 */
export function mergeEventProps<T extends AnyProps[]>(...sources: T): AnyProps {
  const eventHandlers = new Map<string, (...args: unknown[]) => void>();

  const proxy = new Proxy<AnyProps>({}, {
    get(_target, property) {
      if (property === $PROXY) return true;

      // `merge` uses this private symbol to flatten its own nested proxies.
      // This proxy adds event semantics, so flattening it would discard those
      // semantics and expose only the right-most raw event handler.
      if (isMergeSource(property)) return undefined;

      const source = findSource(sources, property);
      const value = source ? Reflect.get(source, property) : undefined;

      if (property === "aria-labelledby") {
        const idSource = findSource(sources, "id");
        const id = idSource ? Reflect.get(idSource, "id") : undefined;
        if (value === id) return undefined;
      }

      if (!isEventProperty(property)) return value;

      let composed = eventHandlers.get(property);
      if (composed) return composed;

      composed = (...args: unknown[]) =>
        untrack(() => {
          // Native events can fire synchronously while Solid is reconciling
          // the DOM (focusout during removal is one example). Resolve every
          // reactive merge source at the imperative event boundary so those
          // reads do not leak into the renderer's current computation.
          const event = args[0];
          const disabled = Boolean(proxy.disabled) ||
            isAriaDisabled(proxy["aria-disabled"]);

          if (disabled && shouldBlockDisabledEvent(property)) {
            if (isEventLike(event)) event.preventDefault();
            return;
          }

          for (const source of sources) {
            const handler = Reflect.get(source, property);
            if (handler == null) continue;

            if (isEventLike(event) && event.defaultPrevented) return;
            invokeEventHandler(handler, args);
          }
        });

      eventHandlers.set(property, composed);
      return composed;
    },
    has(_target, property) {
      if (property === $PROXY) return true;
      if (isMergeSource(property)) return false;
      return findSource(sources, property) !== undefined;
    },
    ownKeys() {
      const keys = new Set<string | symbol>();

      for (const source of sources) {
        for (const property of Reflect.ownKeys(source)) {
          if (isMergeSource(property)) continue;
          const descriptor = Reflect.getOwnPropertyDescriptor(source, property);
          if (descriptor?.enumerable) keys.add(property);
        }
      }

      return [...keys];
    },
    getOwnPropertyDescriptor(_target, property) {
      const source = findSource(sources, property);
      if (!source || isMergeSource(property)) return undefined;

      const descriptor = Reflect.getOwnPropertyDescriptor(source, property);
      return {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get() {
          return Reflect.get(proxy, property);
        },
      };
    },
  });

  return proxy;
}
