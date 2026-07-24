import { env } from "./env.ts";

export function getOwnerDocument<T extends Element>(
  element: T | null | undefined,
): Document | null {
  if (env.isServer) return null;
  if (element == null) return document;

  // Solid assigns refs while cloned template nodes can still belong to the
  // inert template-contents document. That document has no documentElement;
  // effects such as scroll locking need the live document the node is about
  // to be adopted into instead.
  const ownerDocument = element.ownerDocument;
  return ownerDocument?.documentElement ? ownerDocument : document;
}

export function getRootNode<T extends Element>(
  element: T | null | undefined,
): Document | ShadowRoot | null {
  if (env.isServer) return null;
  if (element == null) return document;

  // A disconnected element is its own root at runtime. The upstream utility
  // deliberately keeps the narrower public type because connected Headless UI
  // controls resolve to a Document or ShadowRoot.
  return (element.getRootNode?.() as Document | ShadowRoot | undefined) ??
    element.ownerDocument ?? document;
}

export function getActiveElement(
  element: Element | null | undefined,
): Element | null {
  return getRootNode(element)?.activeElement ?? null;
}

export function isActiveElement(element: Element | null | undefined): boolean {
  return getActiveElement(element) === element;
}
