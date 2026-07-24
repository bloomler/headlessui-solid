import { disposables } from "./disposables.ts";
import * as DOM from "./dom.ts";
import { match } from "./match.ts";
import { getActiveElement, getOwnerDocument, getRootNode } from "./owner.ts";

function isTestEnvironment(): boolean {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: { NODE_ENV?: string } };
  };
  return runtime.process?.env?.NODE_ENV === "test";
}

function excludeUnfocusable(selector: string): string {
  const visibleInTest = isTestEnvironment()
    ? ":not([style*='display: none'])"
    : "";
  return `${selector}:not([tabindex='-1'])${visibleInTest}`;
}

// Credit: https://stackoverflow.com/a/30753870
export const focusableSelector = [
  "[contentEditable=true]",
  "[tabindex]",
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "iframe",
  "input:not([disabled])",
  "select:not([disabled])",
  "details>summary",
  "textarea:not([disabled])",
].map(excludeUnfocusable).join(",");

const autoFocusableSelector = ["[data-autofocus]"]
  .map(excludeUnfocusable)
  .join(",");

export enum Focus {
  First = 1 << 0,
  Previous = 1 << 1,
  Next = 1 << 2,
  Last = 1 << 3,
  WrapAround = 1 << 4,
  NoScroll = 1 << 5,
  AutoFocus = 1 << 6,
}

export enum FocusResult {
  Error,
  Overflow,
  Success,
  Underflow,
}

enum Direction {
  Previous = -1,
  Next = 1,
}

interface QuerySelectorAll {
  querySelectorAll<E extends Element = Element>(
    selectors: string,
  ): NodeListOf<E>;
}

export interface FocusableElementRef {
  readonly current: HTMLElement | null | undefined;
}

export type FocusableElementReference =
  | HTMLElement
  | null
  | undefined
  | FocusableElementRef
  | (() => HTMLElement | null | undefined);

function defaultContainer(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.body;
}

export function getFocusableElements(
  container: QuerySelectorAll | null = defaultContainer(),
): HTMLElement[] {
  if (container == null) return [];

  return Array.from(
    container.querySelectorAll<HTMLElement>(focusableSelector),
  ).sort((a, z) =>
    Math.sign(
      (a.tabIndex || Number.MAX_SAFE_INTEGER) -
        (z.tabIndex || Number.MAX_SAFE_INTEGER),
    )
  );
}

export function getAutoFocusableElements(
  container: QuerySelectorAll | null = defaultContainer(),
): HTMLElement[] {
  if (container == null) return [];

  return Array.from(
    container.querySelectorAll<HTMLElement>(autoFocusableSelector),
  ).sort((a, z) =>
    Math.sign(
      (a.tabIndex || Number.MAX_SAFE_INTEGER) -
        (z.tabIndex || Number.MAX_SAFE_INTEGER),
    )
  );
}

export enum FocusableMode {
  Strict,
  Loose,
}

export function isFocusableElement(
  element: HTMLOrSVGElement & Element,
  mode: FocusableMode = FocusableMode.Strict,
): boolean {
  if (element === getOwnerDocument(element)?.body) return false;

  return match(mode, {
    [FocusableMode.Strict]() {
      return element.matches(focusableSelector);
    },
    [FocusableMode.Loose]() {
      let next: Element | null = element;

      while (next !== null) {
        if (next.matches(focusableSelector)) return true;
        next = next.parentElement;
      }

      return false;
    },
  });
}

export function restoreFocusIfNecessary(element: HTMLElement | null): void {
  if (typeof requestAnimationFrame === "undefined") return;

  disposables().nextFrame(() => {
    const activeElement = getActiveElement(element);

    if (
      activeElement &&
      DOM.isHTMLorSVGElement(activeElement) &&
      !isFocusableElement(activeElement, FocusableMode.Strict)
    ) {
      focusElement(element);
    }
  });
}

enum ActivationMethod {
  Keyboard = 0,
  Mouse = 1,
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.metaKey || event.altKey || event.ctrlKey) return;
      document.documentElement.dataset.headlessuiFocusVisible = "";
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      if (event.detail === ActivationMethod.Mouse) {
        delete document.documentElement.dataset.headlessuiFocusVisible;
      } else if (event.detail === ActivationMethod.Keyboard) {
        document.documentElement.dataset.headlessuiFocusVisible = "";
      }
    },
    true,
  );
}

export function focusElement(element: HTMLOrSVGElement | null): void {
  element?.focus({ preventScroll: true });
}

const selectableSelector = "textarea,input";

function isSelectableElement(
  element: Element | null | undefined,
): element is HTMLInputElement | HTMLTextAreaElement {
  return element?.matches?.(selectableSelector) ?? false;
}

const DOCUMENT_POSITION_PRECEDING = 2;
const DOCUMENT_POSITION_FOLLOWING = 4;

export function sortByDomNode<T>(
  nodes: T[],
  resolveKey: (item: T) => HTMLElement | null = (item) =>
    item as HTMLElement | null,
): T[] {
  return nodes.slice().sort((aItem, zItem) => {
    const a = resolveKey(aItem);
    const z = resolveKey(zItem);
    if (a === null || z === null) return 0;

    const position = a.compareDocumentPosition(z);
    if (position & DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

export function focusFrom(
  current: HTMLElement | null,
  focus: Focus,
  container: QuerySelectorAll | null = current === null
    ? defaultContainer()
    : getRootNode(current),
): FocusResult {
  return focusIn(getFocusableElements(container), focus, {
    relativeTo: current,
  });
}

function resolveReference(
  reference: FocusableElementReference,
): HTMLElement | null {
  if (reference == null) return null;
  if (typeof reference === "function") return reference() ?? null;
  if ("current" in reference) return reference.current ?? null;
  return reference;
}

export function focusIn(
  container: HTMLElement | HTMLElement[],
  focus: Focus,
  {
    sorted = true,
    relativeTo = null,
    skipElements = [],
  }: Partial<{
    sorted: boolean;
    relativeTo: HTMLElement | null;
    skipElements: FocusableElementReference[];
  }> = {},
): FocusResult {
  const root = Array.isArray(container)
    ? container.length > 0
      ? getRootNode(container[0])
      : typeof document === "undefined"
      ? null
      : document
    : getRootNode(container);

  let elements = Array.isArray(container)
    ? sorted ? sortByDomNode(container) : container
    : focus & Focus.AutoFocus
    ? getAutoFocusableElements(container)
    : getFocusableElements(container);

  if (skipElements.length > 0 && elements.length > 1) {
    const skipped = skipElements.map(resolveReference);
    elements = elements.filter((element) => !skipped.includes(element));
  }

  relativeTo = relativeTo ??
    (DOM.isHTMLElement(root?.activeElement) ? root.activeElement : null);

  const direction = (() => {
    if (focus & (Focus.First | Focus.Next)) return Direction.Next;
    if (focus & (Focus.Previous | Focus.Last)) return Direction.Previous;

    throw new Error(
      "Missing Focus.First, Focus.Previous, Focus.Next or Focus.Last",
    );
  })();

  const startIndex = (() => {
    if (focus & Focus.First) return 0;
    if (focus & Focus.Previous) {
      return Math.max(0, elements.indexOf(relativeTo as HTMLElement)) - 1;
    }
    if (focus & Focus.Next) {
      return Math.max(0, elements.indexOf(relativeTo as HTMLElement)) + 1;
    }
    if (focus & Focus.Last) return elements.length - 1;

    throw new Error(
      "Missing Focus.First, Focus.Previous, Focus.Next or Focus.Last",
    );
  })();

  const focusOptions: FocusOptions = focus & Focus.NoScroll
    ? { preventScroll: true }
    : {};

  let offset = 0;
  const total = elements.length;
  let next: HTMLElement | undefined;

  do {
    if (offset >= total || offset + total <= 0) return FocusResult.Error;

    let nextIndex = startIndex + offset;
    if (focus & Focus.WrapAround) {
      nextIndex = (nextIndex + total) % total;
    } else {
      if (nextIndex < 0) return FocusResult.Underflow;
      if (nextIndex >= total) return FocusResult.Overflow;
    }

    next = elements[nextIndex];
    next?.focus(focusOptions);
    offset += direction;
  } while (next !== getActiveElement(next));

  if (focus & (Focus.Next | Focus.Previous) && isSelectableElement(next)) {
    next.select();
  }

  return FocusResult.Success;
}
