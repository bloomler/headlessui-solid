import { type Accessor, createEffect, untrack } from "solid-js";
import { listen, type NativeEventListener } from "../utils/event-listener.ts";

export function createEventListener<TEvent extends Event>(
  target: Accessor<EventTarget | null | undefined>,
  type: string,
  listener: NativeEventListener<TEvent>,
  options?: boolean | AddEventListenerOptions,
): void {
  const untrackedListener: NativeEventListener<TEvent> = (event) => {
    // Native events can fire synchronously in the middle of renderer work
    // (notably `blur` while a Portal range is reconciled). Event handlers are
    // imperative boundaries and must not inherit that outer tracking/strict
    // scope.
    untrack(() => listener(event));
  };

  createEffect(
    target,
    (currentTarget) =>
      listen(
        currentTarget,
        type,
        untrackedListener,
        options,
      ),
  );
}

export function createDocumentEvent<TType extends keyof DocumentEventMap>(
  enabled: Accessor<boolean>,
  type: TType,
  listener: NativeEventListener<DocumentEventMap[TType]>,
  options?: boolean | AddEventListenerOptions,
  owner: Accessor<Document | null> = () =>
    typeof document === "undefined" ? null : document,
): void {
  createEventListener(
    () => enabled() ? owner() : null,
    type,
    listener,
    options,
  );
}

export function createWindowEvent<TType extends keyof WindowEventMap>(
  enabled: Accessor<boolean>,
  type: TType,
  listener: NativeEventListener<WindowEventMap[TType]>,
  options?: boolean | AddEventListenerOptions,
  owner: Accessor<Window | null> = () =>
    typeof window === "undefined" ? null : window,
): void {
  createEventListener(
    () => enabled() ? owner() : null,
    type,
    listener,
    options,
  );
}

export enum TabDirection {
  Forwards,
  Backwards,
}

export function createTabDirection(
  owner?: Accessor<Window | null>,
): Accessor<TabDirection> {
  let direction = TabDirection.Forwards;

  createWindowEvent(
    () => true,
    "keydown",
    (event) => {
      if (event.key !== "Tab") return;
      direction = event.shiftKey
        ? TabDirection.Backwards
        : TabDirection.Forwards;
    },
    true,
    owner,
  );

  return () => direction;
}
