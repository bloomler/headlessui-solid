import * as DOM from "./dom.ts";

// See: https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#concept-fe-disabled
export function isDisabledByFieldset(element: Element): boolean {
  let parent = element.parentElement;
  let legend: HTMLLegendElement | null = null;

  while (parent && !DOM.isHTMLFieldSetElement(parent)) {
    if (DOM.isHTMLLegendElement(parent)) legend = parent;
    parent = parent.parentElement;
  }

  const isParentDisabled = parent?.getAttribute("disabled") === "";
  if (isParentDisabled && isFirstLegend(legend)) return false;

  return isParentDisabled;
}

function isFirstLegend(element: HTMLLegendElement | null): boolean {
  if (!element) return false;

  let previous = element.previousElementSibling;
  while (previous !== null) {
    if (DOM.isHTMLLegendElement(previous)) return false;
    previous = previous.previousElementSibling;
  }

  return true;
}
