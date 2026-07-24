import { type Accessor, createSignal, onSettled } from "solid-js";

type FocusModality = "keyboard" | "pointer";

const focusModality = new WeakMap<Document, FocusModality>();
const trackedDocuments = new WeakSet<Document>();

function trackFocusModality(ownerDocument: Document): void {
  if (trackedDocuments.has(ownerDocument)) return;
  trackedDocuments.add(ownerDocument);
  focusModality.set(ownerDocument, "keyboard");

  ownerDocument.addEventListener(
    "keydown",
    (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      focusModality.set(ownerDocument, "keyboard");
    },
    true,
  );
  ownerDocument.addEventListener(
    "pointerdown",
    () => focusModality.set(ownerDocument, "pointer"),
    true,
  );
}

if (typeof document !== "undefined") {
  trackFocusModality(document);
}

type Rect = Pick<DOMRect, "bottom" | "left" | "right" | "top">;

function pointerRect(event: PointerEvent): Rect {
  const offsetX = event.width / 2;
  const offsetY = event.height / 2;

  return {
    top: event.clientY - offsetY,
    right: event.clientX + offsetX,
    bottom: event.clientY + offsetY,
    left: event.clientX - offsetX,
  };
}

function overlaps(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return false;
  if (a.right < b.left || a.left > b.right) return false;
  if (a.bottom < b.top || a.top > b.bottom) return false;
  return true;
}

type InteractionOptions = {
  autofocus?: Accessor<boolean>;
  disabled?: Accessor<boolean>;
};

export function createFocusRing(
  options: InteractionOptions & { focusVisibleOnly?: boolean } = {},
) {
  const [focused, setFocused] = createSignal(false);
  const disabled = options.disabled ?? (() => false);

  return {
    focused,
    focusProps: {
      onKeyDown(event: KeyboardEvent & { currentTarget: HTMLElement }) {
        const ownerDocument = event.currentTarget.ownerDocument;
        trackFocusModality(ownerDocument);
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        focusModality.set(ownerDocument, "keyboard");
        if (!disabled() && options.focusVisibleOnly !== false) {
          setFocused(true);
        }
      },
      onPointerDown(event: PointerEvent & { currentTarget: HTMLElement }) {
        const ownerDocument = event.currentTarget.ownerDocument;
        trackFocusModality(ownerDocument);
        focusModality.set(ownerDocument, "pointer");
        if (options.focusVisibleOnly !== false) setFocused(false);
      },
      onFocus(event: FocusEvent & { currentTarget: HTMLElement }) {
        if (disabled()) return;

        let isFocusVisible = true;
        if (options.focusVisibleOnly !== false) {
          const ownerDocument = event.currentTarget.ownerDocument;
          trackFocusModality(ownerDocument);
          isFocusVisible = Boolean(options.autofocus?.()) ||
            focusModality.get(ownerDocument) === "keyboard";
        }
        setFocused(isFocusVisible);
      },
      onBlur() {
        setFocused(false);
      },
    },
  };
}

export function createHover(options: InteractionOptions = {}) {
  const [hovered, setHovered] = createSignal(false);
  const disabled = options.disabled ?? (() => false);

  return {
    hovered,
    hoverProps: {
      onPointerEnter(event: PointerEvent) {
        if (disabled() || event.pointerType === "touch") return;
        setHovered(true);
      },
      onPointerLeave(event: PointerEvent) {
        if (event.pointerType === "touch") return;
        setHovered(false);
      },
      onPointerCancel() {
        setHovered(false);
      },
    },
  };
}

export function createActivePress(options: InteractionOptions = {}) {
  const [pressed, setPressed] = createSignal(false, { ownedWrite: true });
  const disabled = options.disabled ?? (() => false);

  let target: HTMLElement | null = null;
  // A synchronous ref/test event can arrive before the first settle. Keep
  // external listeners behind the owner-backed teardown so that disposing
  // during that window cannot strand document listeners.
  let settled = false;
  let disposeDocumentListeners = () => {};

  const reset = () => {
    target = null;
    setPressed(false);
    disposeDocumentListeners();
    disposeDocumentListeners = () => {};
  };

  const listenForRelease = () => {
    if (!settled || !target) return;

    const owner = target.ownerDocument;
    const onPointerMove = (nextEvent: PointerEvent) => {
      if (!target) return;
      setPressed(
        overlaps(pointerRect(nextEvent), target.getBoundingClientRect()),
      );
    };

    owner.addEventListener("pointerup", reset);
    owner.addEventListener("pointermove", onPointerMove);
    owner.addEventListener("pointercancel", reset);
    disposeDocumentListeners = () => {
      owner.removeEventListener("pointerup", reset);
      owner.removeEventListener("pointermove", onPointerMove);
      owner.removeEventListener("pointercancel", reset);
    };
  };

  onSettled(() => {
    settled = true;
    listenForRelease();
    return () => {
      settled = false;
      reset();
    };
  });

  const onPointerDown = (
    event: PointerEvent & { currentTarget: HTMLElement },
  ) => {
    if (disabled() || target !== null) return;
    disposeDocumentListeners();

    target = event.currentTarget;
    setPressed(true);
    listenForRelease();
  };

  return {
    pressed,
    pressProps: {
      onPointerDown,
      onPointerUp: reset,
      onClick: reset,
    },
  };
}
