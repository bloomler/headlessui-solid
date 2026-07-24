import * as DOM from "./dom.ts";

type Entries = [string, string][];
type FormDataSource = Record<string, unknown> | readonly unknown[];

export function objectToFormEntries(
  source: FormDataSource = {},
  parentKey: string | null = null,
  entries: Entries = [],
): Entries {
  for (const [key, value] of Object.entries(source)) {
    append(entries, composeKey(parentKey, key), value);
  }

  return entries;
}

function composeKey(parent: string | null, key: string): string {
  return parent ? `${parent}[${key}]` : key;
}

function append(entries: Entries, key: string, value: unknown): void {
  if (Array.isArray(value)) {
    for (const [subkey, subvalue] of value.entries()) {
      append(entries, composeKey(key, subkey.toString()), subvalue);
    }
  } else if (value instanceof Date) {
    entries.push([key, value.toISOString()]);
  } else if (typeof value === "boolean") {
    entries.push([key, value ? "1" : "0"]);
  } else if (typeof value === "string") {
    entries.push([key, value]);
  } else if (typeof value === "number") {
    entries.push([key, `${value}`]);
  } else if (value === null || value === undefined) {
    entries.push([key, ""]);
  } else if (isPlainObject(value)) {
    objectToFormEntries(value, key, entries);
  }
}

export function attemptSubmit(elementInForm: HTMLElement): void {
  const associatedElement = elementInForm as HTMLElement & {
    readonly form?: HTMLFormElement | null;
  };
  const form = associatedElement.form ?? elementInForm.closest("form");
  if (!form) return;

  for (const element of form.elements) {
    if (element === elementInForm || !DOM.isHTMLElement(element)) continue;

    const type = "type" in element && typeof element.type === "string"
      ? element.type
      : null;
    if (
      (element.tagName === "INPUT" && type === "submit") ||
      (element.tagName === "BUTTON" && type === "submit") ||
      (element.nodeName === "INPUT" && type === "image")
    ) {
      // Clicking the submitter preserves the browser's click cancellation
      // semantics, unlike passing it directly to requestSubmit().
      element.click();
      return;
    }
  }

  form.requestSubmit?.();
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== "[object Object]") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}
