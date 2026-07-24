// Cross-realm DOM checks intentionally use structural properties rather than
// `instanceof`, which fails for elements owned by another window or iframe.

export function isNode(element: unknown): element is Node {
  if (typeof element !== "object" || element === null) return false;
  return "nodeType" in element;
}

export function isElement(element: unknown): element is Element {
  return isNode(element) && "tagName" in element;
}

export function isHTMLElement(element: unknown): element is HTMLElement {
  return isElement(element) && "accessKey" in element;
}

export function isHTMLorSVGElement(
  element: unknown,
): element is HTMLOrSVGElement & Element {
  return isElement(element) && "tabIndex" in element;
}

export function hasInlineStyle(
  element: unknown,
): element is ElementCSSInlineStyle {
  return isElement(element) && "style" in element;
}

export function isHTMLIframeElement(
  element: unknown,
): element is HTMLIFrameElement {
  return isHTMLElement(element) && element.nodeName === "IFRAME";
}

export function isHTMLInputElement(
  element: unknown,
): element is HTMLInputElement {
  return isHTMLElement(element) && element.nodeName === "INPUT";
}

export function isHTMLTextAreaElement(
  element: unknown,
): element is HTMLTextAreaElement {
  return isHTMLElement(element) && element.nodeName === "TEXTAREA";
}

export function isHTMLLabelElement(
  element: unknown,
): element is HTMLLabelElement {
  return isHTMLElement(element) && element.nodeName === "LABEL";
}

export function isHTMLFieldSetElement(
  element: unknown,
): element is HTMLFieldSetElement {
  return isHTMLElement(element) && element.nodeName === "FIELDSET";
}

export function isHTMLLegendElement(
  element: unknown,
): element is HTMLLegendElement {
  return isHTMLElement(element) && element.nodeName === "LEGEND";
}

// https://html.spec.whatwg.org/#interactive-content-2
export function isInteractiveElement(element: unknown): element is Element {
  if (!isElement(element)) return false;

  return element.matches(
    'a[href],audio[controls],button,details,embed,iframe,img[usemap],input:not([type="hidden"]),label,select,textarea,video[controls]',
  );
}
