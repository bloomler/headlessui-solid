import * as DOM from "./dom.ts";

const emojiRegex =
  /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g;

interface IdReferenceRoot {
  getElementById(id: string): Element | null;
}

function canResolveIds(value: unknown): value is IdReferenceRoot {
  return typeof value === "object" && value !== null &&
    "getElementById" in value &&
    typeof value.getElementById === "function";
}

function resolveId(element: Element, id: string): Element | null {
  const root = element.getRootNode?.();
  if (canResolveIds(root)) return root.getElementById(id);

  return element.ownerDocument?.getElementById(id) ?? null;
}

function readHumanText(element: Element): string {
  if (DOM.isHTMLElement(element) && typeof element.innerText === "string") {
    return element.innerText;
  }

  return element.textContent ?? "";
}

function getTextContents(element: Element): string {
  // `innerText` reflects human-readable content. SVG and other non-HTML
  // elements do not expose it, so use textContent as their fallback.
  const currentInnerText = readHumanText(element);

  const copy = element.cloneNode(true);
  if (!DOM.isElement(copy)) return currentInnerText;

  let dropped = false;
  for (
    const child of copy.querySelectorAll(
      '[hidden],[aria-hidden],[role="img"]',
    )
  ) {
    child.remove();
    dropped = true;
  }

  let value = dropped ? readHumanText(copy) : currentInnerText;

  // Reset the global expression before testing so repeated calls are stable.
  emojiRegex.lastIndex = 0;
  if (emojiRegex.test(value)) {
    emojiRegex.lastIndex = 0;
    value = value.replace(emojiRegex, "");
  }

  return value;
}

export function getTextValue(element: HTMLElement): string {
  const label = element.getAttribute("aria-label");
  if (typeof label === "string") return label.trim();

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labels = labelledBy
      .split(/\s+/)
      .map((id) => {
        const labelElement = resolveId(element, id);
        if (!labelElement) return null;

        const referencedLabel = labelElement.getAttribute("aria-label");
        if (typeof referencedLabel === "string") {
          return referencedLabel.trim();
        }

        return getTextContents(labelElement).trim();
      })
      .filter((value): value is string => Boolean(value));

    if (labels.length > 0) return labels.join(", ");
  }

  return getTextContents(element).trim();
}
