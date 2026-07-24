export type NativeEventListener<TEvent extends Event = Event> = (
  event: TEvent,
) => void;

/** Attach one native listener and return an idempotent disposer. */
export function listen<TEvent extends Event>(
  target: EventTarget | null | undefined,
  type: string,
  listener: NativeEventListener<TEvent>,
  options?: boolean | AddEventListenerOptions,
): () => void {
  if (!target) return () => {};

  const nativeListener = listener as EventListener;
  target.addEventListener(type, nativeListener, options);
  let active = true;

  return () => {
    if (!active) return;
    active = false;
    target.removeEventListener(type, nativeListener, options);
  };
}
