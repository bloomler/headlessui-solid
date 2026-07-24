import { type Accessor, createEffect } from "solid-js";
import { disposables } from "../utils/disposables.ts";
import { getOwnerDocument } from "../utils/owner.ts";

export function createOnDisappear(
  enabled: Accessor<boolean>,
  element: Accessor<HTMLElement | null | undefined>,
  callback: () => void,
): void {
  const inspect = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    if (
      rect.x === 0 && rect.y === 0 && rect.width === 0 && rect.height === 0
    ) {
      callback();
    }
  };

  createEffect(
    () => enabled() ? element() ?? null : null,
    (target) => {
      if (!target) return;

      const cleanup = disposables();
      // Refs can be assigned before a portalled template node is connected
      // and before its children have been inserted. Observing that transient
      // zero-sized node would incorrectly report it as disappeared.
      cleanup.microTask(() => {
        let observing = false;
        const observeTarget = (): boolean => {
          if (observing) return true;
          if (!target.isConnected) return false;
          observing = true;
          const ownerWindow = getOwnerDocument(target)?.defaultView;

          if (ownerWindow && "ResizeObserver" in ownerWindow) {
            const observer = new ownerWindow.ResizeObserver(() =>
              inspect(target)
            );
            observer.observe(target);
            cleanup.add(() => observer.disconnect());
          }

          if (ownerWindow && "IntersectionObserver" in ownerWindow) {
            const observer = new ownerWindow.IntersectionObserver(() =>
              inspect(target)
            );
            observer.observe(target);
            cleanup.add(() => observer.disconnect());
          }

          return true;
        };

        if (observeTarget()) return;

        const ownerDocument = getOwnerDocument(target);
        const Observer = ownerDocument?.defaultView?.MutationObserver;
        if (!ownerDocument || !Observer) return;

        const connectionObserver = new Observer(() => {
          if (!observeTarget()) return;
          connectionObserver.disconnect();
        });
        connectionObserver.observe(ownerDocument, {
          childList: true,
          subtree: true,
        });
        cleanup.add(() => connectionObserver.disconnect());

        if (observeTarget()) connectionObserver.disconnect();
      });

      return cleanup.dispose;
    },
  );
}
