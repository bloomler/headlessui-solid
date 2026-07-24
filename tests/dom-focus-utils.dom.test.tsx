import { afterEach, expect, test, vi } from "vitest";
import { history } from "../src/utils/active-element-history.ts";
import { isDisabledByFieldset } from "../src/utils/bugs.ts";
import {
  detectMovement,
  ElementPositionState,
} from "../src/utils/element-movement.ts";
import {
  Focus,
  focusableSelector,
  focusIn,
  FocusResult,
  getFocusableElements,
} from "../src/utils/focus-management.ts";
import { attemptSubmit } from "../src/utils/form.ts";
import { getTextValue } from "../src/utils/get-text-value.ts";
import { getOwnerDocument, getRootNode } from "../src/utils/owner.ts";

const hosts: HTMLElement[] = [];

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
  history.splice(0);
  vi.unstubAllGlobals();
});

test("aria-labelledby resolves within the originating shadow root", () => {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  const label = document.createElement("span");
  const target = document.createElement("button");

  label.id = "shadow-label";
  label.innerText = "  Shadow label  ";
  target.setAttribute("aria-labelledby", label.id);
  root.append(label, target);
  document.body.append(host);
  hosts.push(host);

  expect(getTextValue(target)).toBe("Shadow label");
});

test("text extraction strips hidden content, image roles, and emoji", () => {
  const element = document.createElement("div");
  element.innerHTML = `
    <span hidden>Hidden</span>
    <span aria-hidden="true">Screen-reader hidden</span>
    <span role="img">🇨🇦</span>
    Canada
  `;

  expect(getTextValue(element)).toBe("Canada");
});

test("text extraction reads direct element text", () => {
  const element = document.createElement("div");
  element.innerText = "Hello World";

  expect(getTextValue(element)).toBe("Hello World");
});

test.each([
  ["emoji", "🇨🇦 Canada", "Canada"],
  ["hidden content", "<span hidden>Hello</span> world", "world"],
  [
    "aria-hidden content",
    "<span aria-hidden>Screen reader hidden</span> world",
    "world",
  ],
  ["image-role content", '<span role="img">°</span> world', "world"],
])("text extraction strips %s", (_name, contents, expected) => {
  const element = document.createElement("div");
  element.innerHTML = contents;

  expect(getTextValue(element)).toBe(expected);
});

test("aria-label overrides both empty and visible contents", () => {
  const empty = document.createElement("div");
  empty.setAttribute("aria-label", "Hello World");

  const populated = document.createElement("div");
  populated.setAttribute("aria-label", "Hello World");
  populated.innerText = "Hello Universe";

  expect(getTextValue(empty)).toBe("Hello World");
  expect(getTextValue(populated)).toBe("Hello World");
});

test.each([
  [
    "a referenced aria-label",
    '<div id="target" aria-labelledby="label">Ignored</div>' +
    '<div id="label" aria-label="Label value">Ignored label text</div>',
    "Label value",
  ],
  [
    "referenced contents",
    '<div id="target" aria-labelledby="label">Ignored</div>' +
    '<div id="label">Label contents</div>',
    "Label contents",
  ],
  [
    "multiple referenced aria-labels",
    '<div id="target" aria-labelledby="first second">Ignored</div>' +
    '<div id="first" aria-label="First value">Ignored first</div>' +
    '<div id="second" aria-label="Second value">Ignored second</div>',
    "First value, Second value",
  ],
  [
    "multiple referenced contents",
    '<div id="target" aria-labelledby="first second">Ignored</div>' +
    '<div id="first">First contents</div>' +
    '<div id="second">Second contents</div>',
    "First contents, Second contents",
  ],
])("text extraction resolves %s", (_name, markup, expected) => {
  const host = document.createElement("div");
  host.innerHTML = markup;
  document.body.append(host);
  hosts.push(host);

  expect(
    getTextValue(host.querySelector<HTMLElement>("#target")!),
  ).toBe(expected);
});

test("owner helpers preserve a foreign document", () => {
  const foreignDocument = document.implementation.createHTMLDocument("foreign");
  const button = foreignDocument.createElement("button");
  foreignDocument.body.append(button);

  expect(getOwnerDocument(button)).toBe(foreignDocument);
  expect(getRootNode(button)).toBe(foreignDocument);
});

test("owner document falls back from inert template contents to the live document", () => {
  const template = document.createElement("template");
  template.innerHTML = '<button type="button">Template button</button>';
  const button = template.content.firstElementChild as HTMLButtonElement;

  expect(button.ownerDocument.documentElement).toBeNull();
  expect(getOwnerDocument(button)).toBe(document);
});

test("active history resolves a nested event target to its focusable owner", () => {
  const button = document.createElement("button");
  const child = document.createElement("span");
  button.append(child);
  document.body.append(button);
  hosts.push(button);

  child.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  expect(history[0]).toBe(button);
});

test("movement tracking fires once and disconnects its observer", () => {
  let observerCallback: ResizeObserverCallback | undefined;
  let disconnects = 0;

  class TestResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      observerCallback = callback;
    }

    observe(): void {}

    disconnect(): void {
      disconnects++;
    }

    unobserve(): void {}
  }

  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  const target = document.createElement("div");
  let x = 0;
  target.getBoundingClientRect = () => ({ x, y: 0 } as DOMRect);

  let moves = 0;
  const dispose = detectMovement(
    target,
    ElementPositionState.Tracked("0,0"),
    () => moves++,
  );

  x = 10;
  observerCallback?.([], {} as ResizeObserver);
  globalThis.dispatchEvent(new Event("resize"));
  dispose();

  expect(moves).toBe(1);
  expect(disconnects).toBe(1);
});

test("focus traversal supports Solid accessors and structural ref cells", () => {
  const host = document.createElement("div");
  const first = document.createElement("button");
  const second = document.createElement("button");
  const third = document.createElement("button");
  host.append(first, second, third);
  document.body.append(host);
  hosts.push(host);

  expect(focusableSelector).toContain(":not([tabindex='-1'])");
  expect(getFocusableElements(host)).toEqual([first, second, third]);
  expect(
    focusIn([first, second, third], Focus.First, {
      sorted: false,
      skipElements: [() => first, { current: second }],
    }),
  ).toBe(FocusResult.Success);
  expect(document.activeElement).toBe(third);

  expect(
    focusIn([first, second, third], Focus.Previous | Focus.WrapAround, {
      relativeTo: first,
      sorted: false,
    }),
  ).toBe(FocusResult.Success);
  expect(document.activeElement).toBe(third);
});

test("disabled fieldsets exempt controls in only the first legend", () => {
  const fieldset = document.createElement("fieldset");
  const firstLegend = document.createElement("legend");
  const secondLegend = document.createElement("legend");
  const firstControl = document.createElement("button");
  const secondControl = document.createElement("button");
  const directControl = document.createElement("button");

  fieldset.disabled = true;
  firstLegend.append(firstControl);
  secondLegend.append(secondControl);
  fieldset.append(firstLegend, secondLegend, directControl);

  expect(isDisabledByFieldset(firstControl)).toBe(false);
  expect(isDisabledByFieldset(secondControl)).toBe(true);
  expect(isDisabledByFieldset(directControl)).toBe(true);
});

test("attemptSubmit clicks a submitter so click cancellation is observed", () => {
  const form = document.createElement("form");
  const input = document.createElement("input");
  const submitter = document.createElement("button");
  submitter.type = "submit";
  form.append(input, submitter);
  document.body.append(form);
  hosts.push(form);

  let clicks = 0;
  let submits = 0;
  submitter.addEventListener("click", (event) => {
    clicks++;
    event.preventDefault();
  });
  form.addEventListener("submit", (event) => {
    submits++;
    event.preventDefault();
  });

  attemptSubmit(input);
  expect(clicks).toBe(1);
  expect(submits).toBe(0);
});
