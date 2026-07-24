import { disposables } from "./disposables.ts";

export const ElementPositionState = {
  Idle: { kind: "Idle" as const },
  Tracked: (position: string) => ({ kind: "Tracked" as const, position }),
  Moved: { kind: "Moved" as const },
};

type ResolvedStates<T extends Record<string, unknown>> = {
  [Key in keyof T]: T[Key] extends (...args: never[]) => infer Result ? Result
    : T[Key];
}[keyof T];

export type ElementPositionState = ResolvedStates<
  typeof ElementPositionState
>;

export function computeVisualPosition(element: HTMLElement): string {
  const rect = element.getBoundingClientRect();
  return `${rect.x},${rect.y}`;
}

export function detectMovement(
  target: HTMLElement,
  state: ElementPositionState,
  onMove: () => void,
): () => void {
  const disposable = disposables();

  if (state.kind === "Tracked") {
    const ownerWindow = target.ownerDocument?.defaultView ??
      (typeof window === "undefined" ? null : window);
    const ResizeObserverConstructor = ownerWindow?.ResizeObserver ??
      (typeof ResizeObserver === "undefined" ? null : ResizeObserver);

    if (!ownerWindow || !ResizeObserverConstructor) {
      return () => disposable.dispose();
    }

    const { position } = state;
    const check = () => {
      if (position !== computeVisualPosition(target)) {
        disposable.dispose();
        onMove();
      }
    };

    const observer = new ResizeObserverConstructor(check);
    observer.observe(target);
    disposable.add(() => observer.disconnect());
    disposable.addEventListener(ownerWindow, "scroll", check, {
      passive: true,
    });
    disposable.addEventListener(ownerWindow, "resize", check);
  }

  return () => disposable.dispose();
}
