import { type Accessor, createEffect } from "solid-js";
import { disposables } from "../utils/disposables.ts";
import { getOwnerDocument } from "../utils/owner.ts";
import { createIsTopLayer } from "./top-layer.ts";

interface OriginalInertState {
  "aria-hidden": string | null;
  inert: boolean;
}

const originals = new Map<HTMLElement, OriginalInertState>();
const counts = new Map<HTMLElement, number>();

function releaseInert(element: HTMLElement): void {
  const count = counts.get(element) ?? 1;
  if (count === 1) counts.delete(element);
  else counts.set(element, count - 1);

  if (count !== 1) return;
  const original = originals.get(element);
  if (!original) return;

  if (original["aria-hidden"] === null) {
    element.removeAttribute("aria-hidden");
  } else {
    element.setAttribute("aria-hidden", original["aria-hidden"]);
  }
  element.inert = original.inert;
  originals.delete(element);
}

export function acquireInert(element: HTMLElement): () => void {
  const count = counts.get(element) ?? 0;
  counts.set(element, count + 1);
  if (count !== 0) return () => releaseInert(element);

  originals.set(element, {
    "aria-hidden": element.getAttribute("aria-hidden"),
    inert: element.inert,
  });
  element.setAttribute("aria-hidden", "true");
  element.inert = true;

  return () => releaseInert(element);
}

export interface InertOthersOptions {
  allowed?: Accessor<readonly (HTMLElement | null | undefined)[]>;
  disallowed?: Accessor<readonly (HTMLElement | null | undefined)[]>;
}

/** Mark everything except the allowed overlay branches inert. */
export function createInertOthers(
  enabled: Accessor<boolean>,
  options: InertOthersOptions = {},
): void {
  const isTopLayer = createIsTopLayer(enabled, "inert-others");

  createEffect(
    () => {
      if (!isTopLayer()) return null;
      return {
        allowed: options.allowed?.() ?? [],
        disallowed: options.disallowed?.() ?? [],
      };
    },
    (state) => {
      if (!state) return;
      const cleanup = disposables();

      for (const element of state.disallowed) {
        if (element) cleanup.add(acquireInert(element));
      }

      const allowedElements = state.allowed.filter(
        (element): element is HTMLElement => element != null,
      );

      for (const element of allowedElements) {
        const ownerDocument = getOwnerDocument(element);
        if (!ownerDocument) continue;

        let parent = element.parentElement;
        while (parent && parent !== ownerDocument.body) {
          for (const node of parent.children) {
            if (allowedElements.some((allowed) => node.contains(allowed))) {
              continue;
            }
            cleanup.add(acquireInert(node as HTMLElement));
          }
          parent = parent.parentElement;
        }
      }

      return cleanup.dispose;
    },
  );
}
