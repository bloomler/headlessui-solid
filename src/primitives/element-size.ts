import { type Accessor, createEffect, createSignal, untrack } from "solid-js";
import { disposables } from "../utils/disposables.ts";

interface ElementSize {
  height: number;
  width: number;
}

function computeSize(element: HTMLElement | null): ElementSize {
  if (!element) return { height: 0, width: 0 };
  const { height, width } = element.getBoundingClientRect();
  return { height, width };
}

export function createElementSize(
  enabled: Accessor<boolean>,
  element: Accessor<HTMLElement | null>,
  unit: true,
): { readonly height: string; readonly width: string };
export function createElementSize(
  enabled: Accessor<boolean>,
  element: Accessor<HTMLElement | null>,
  unit?: false,
): { readonly height: number; readonly width: number };
export function createElementSize(
  enabled: Accessor<boolean>,
  element: Accessor<HTMLElement | null>,
  unit = false,
): {
  readonly height: number | string;
  readonly width: number | string;
} {
  let currentSize = computeSize(untrack(element));
  const [size, setSize] = createSignal(
    currentSize,
    { ownedWrite: true },
  );

  createEffect(
    () => enabled() ? element() : null,
    (target) => {
      if (!target) return;
      const cleanup = disposables();

      const update = () => {
        const next = computeSize(target);
        if (
          next.height !== currentSize.height || next.width !== currentSize.width
        ) {
          currentSize = next;
          setSize(next);
        }
        cleanup.requestAnimationFrame(update);
      };
      cleanup.requestAnimationFrame(update);
      return cleanup.dispose;
    },
  );

  return {
    get height(): number | string {
      return unit ? `${size().height}px` : size().height;
    },
    get width(): number | string {
      return unit ? `${size().width}px` : size().width;
    },
  };
}
