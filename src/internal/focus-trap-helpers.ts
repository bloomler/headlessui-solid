import type { Accessor } from "solid-js";
import * as DOM from "../utils/dom.ts";
import type { FocusableElementReference } from "../utils/focus-management.ts";

/**
 * Element reference accepted by focus-trap container options.
 */
export type FocusTrapElementReference = FocusableElementReference;

export type FocusTrapContainerReference =
  | Element
  | null
  | undefined
  | Accessor<Element | null | undefined>
  | { readonly current: Element | null | undefined };

export type FocusTrapContainerCollection = Iterable<
  FocusTrapContainerReference
>;

/**
 * Container collection that participates in a focus trap.
 */
export type FocusTrapContainers =
  | FocusTrapContainerCollection
  | Accessor<FocusTrapContainerCollection>
  | { readonly current: FocusTrapContainerCollection };

function isIterable(
  value: unknown,
): value is FocusTrapContainerCollection {
  return typeof value === "object" && value !== null &&
    Symbol.iterator in value;
}

export function resolveFocusTrapElement(
  reference: FocusTrapElementReference,
): HTMLElement | null {
  if (reference == null) return null;
  if (typeof reference === "function") return reference() ?? null;
  if (DOM.isHTMLElement(reference)) return reference;
  return reference.current ?? null;
}

function resolveContainerReference(
  reference: FocusTrapContainerReference,
): Element | null {
  if (reference == null) return null;
  if (typeof reference === "function") {
    const element = reference();
    return DOM.isElement(element) ? element : null;
  }
  if (DOM.isElement(reference)) return reference;
  return DOM.isElement(reference.current) ? reference.current : null;
}

export function resolveFocusTrapContainers(
  containers?: FocusTrapContainers,
): Set<Element> {
  if (!containers) return new Set();

  const collection = typeof containers === "function"
    ? containers()
    : isIterable(containers)
    ? containers
    : containers.current;
  const resolved = new Set<Element>();

  for (const reference of collection) {
    const element = resolveContainerReference(reference);
    if (element) resolved.add(element);
  }

  return resolved;
}

export function containsFocusTrapTarget(
  containers: Iterable<Element>,
  target: Element,
): boolean {
  for (const container of containers) {
    if (container.contains(target)) return true;
  }
  return false;
}
