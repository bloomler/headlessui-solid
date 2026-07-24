import { isDisabledByFieldset } from "../../src/utils/bugs.ts";
import { onDocumentReady } from "../../src/utils/document-ready.ts";
import * as DOM from "../../src/utils/dom.ts";
import {
  computeVisualPosition,
  detectMovement,
  ElementPositionState,
} from "../../src/utils/element-movement.ts";
import { env } from "../../src/utils/env.ts";
import {
  Focus,
  FocusableMode,
  focusableSelector,
  focusElement,
  focusIn,
  FocusResult,
  getAutoFocusableElements,
  getFocusableElements,
  isFocusableElement,
  sortByDomNode,
} from "../../src/utils/focus-management.ts";
import { attemptSubmit, objectToFormEntries } from "../../src/utils/form.ts";
import { getTextValue } from "../../src/utils/get-text-value.ts";
import {
  getActiveElement,
  getOwnerDocument,
  getRootNode,
} from "../../src/utils/owner.ts";
import { isAndroid, isIOS, isMobile } from "../../src/utils/platform.ts";

function strictEqual(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Expected ${JSON.stringify(actual)} to strictly equal ${
        JSON.stringify(expected)
      }`,
    );
  }
}

function deepStrictEqual(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${actualJson} to deeply equal ${expectedJson}`);
  }
}

function fakeHtmlElement(
  nodeName: string,
  extra: Record<string, unknown> = {},
): HTMLElement {
  return {
    accessKey: "",
    nodeName,
    nodeType: 1,
    tabIndex: 0,
    tagName: nodeName,
    ...extra,
  } as unknown as HTMLElement;
}

Deno.test("DOM predicates stay cross-realm and constructor independent", () => {
  const button = fakeHtmlElement("BUTTON", {
    matches: (selector: string) => selector.includes("button"),
    style: {},
  });

  strictEqual(DOM.isNode(button), true);
  strictEqual(DOM.isElement(button), true);
  strictEqual(DOM.isHTMLElement(button), true);
  strictEqual(DOM.isHTMLorSVGElement(button), true);
  strictEqual(DOM.hasInlineStyle(button), true);
  strictEqual(DOM.isInteractiveElement(button), true);
  strictEqual(DOM.isHTMLInputElement(button), false);
  strictEqual(DOM.isNode({}), false);
});

Deno.test("owner, platform, and document-ready helpers are server safe", () => {
  const previousEnvironment = env.current;
  env.set("server");

  try {
    const element = fakeHtmlElement("DIV");
    strictEqual(getOwnerDocument(element), null);
    strictEqual(getRootNode(element), null);
    strictEqual(getActiveElement(element), null);
    strictEqual(isIOS(), false);
    strictEqual(isAndroid(), false);
    strictEqual(isMobile(), false);

    let ready = false;
    onDocumentReady(() => {
      ready = true;
    });
    strictEqual(ready, false);
  } finally {
    env.set(previousEnvironment);
  }
});

Deno.test("disabled fieldset exception applies only to its first legend", () => {
  const fieldset = fakeHtmlElement("FIELDSET", {
    getAttribute: (name: string) => name === "disabled" ? "" : null,
    parentElement: null,
  });
  const firstLegend = fakeHtmlElement("LEGEND", {
    parentElement: fieldset,
    previousElementSibling: null,
  });
  const secondLegend = fakeHtmlElement("LEGEND", {
    parentElement: fieldset,
    previousElementSibling: firstLegend,
  });

  const firstControl = fakeHtmlElement("INPUT", {
    parentElement: firstLegend,
  });
  const secondControl = fakeHtmlElement("INPUT", {
    parentElement: secondLegend,
  });
  const directControl = fakeHtmlElement("INPUT", {
    parentElement: fieldset,
  });

  strictEqual(isDisabledByFieldset(firstControl), false);
  strictEqual(isDisabledByFieldset(secondControl), true);
  strictEqual(isDisabledByFieldset(directControl), true);
});

Deno.test("element movement primitives preserve positions and SSR cleanup", () => {
  const target = fakeHtmlElement("DIV", {
    getBoundingClientRect: () => ({ x: 12.5, y: -4 }),
    ownerDocument: null,
  });

  strictEqual(computeVisualPosition(target), "12.5,-4");
  deepStrictEqual(ElementPositionState.Tracked("12.5,-4"), {
    kind: "Tracked",
    position: "12.5,-4",
  });

  let moved = false;
  const dispose = detectMovement(
    target,
    ElementPositionState.Tracked("12.5,-4"),
    () => {
      moved = true;
    },
  );
  dispose();
  strictEqual(moved, false);
});

Deno.test("text values prefer a trimmed aria-label without touching the DOM", () => {
  const element = fakeHtmlElement("DIV", {
    getAttribute: (name: string) =>
      name === "aria-label" ? "  Accessible name  " : null,
  });
  strictEqual(getTextValue(element), "Accessible name");
});

Deno.test("form entries retain Headless UI's recursive encoding", () => {
  const date = new Date("2026-07-23T10:20:30.000Z");
  const entries = objectToFormEntries({
    id: 7,
    enabled: true,
    ignored: Symbol("ignored"),
    name: { first: "Ada", aliases: ["A", null] },
    when: date,
  });

  deepStrictEqual(entries, [
    ["id", "7"],
    ["enabled", "1"],
    ["name[first]", "Ada"],
    ["name[aliases][0]", "A"],
    ["name[aliases][1]", ""],
    ["when", "2026-07-23T10:20:30.000Z"],
  ]);
  deepStrictEqual(objectToFormEntries([1, false, undefined]), [
    ["0", "1"],
    ["1", "0"],
    ["2", ""],
  ]);
});

Deno.test("attemptSubmit clicks the first non-triggering submitter", () => {
  let clicked = 0;
  let requested = 0;
  const submitter = fakeHtmlElement("BUTTON", {
    click: () => clicked++,
    type: "submit",
  });
  const form = {
    elements: [] as HTMLElement[],
    requestSubmit: () => requested++,
  };
  const trigger = fakeHtmlElement("INPUT", { form });
  form.elements.push(trigger, submitter);

  attemptSubmit(trigger);
  strictEqual(clicked, 1);
  strictEqual(requested, 0);
});

Deno.test("attemptSubmit falls back to requestSubmit without a submitter", () => {
  let requested = 0;
  const form = {
    elements: [] as HTMLElement[],
    requestSubmit: () => requested++,
  };
  const trigger = fakeHtmlElement("INPUT", { form });
  form.elements.push(trigger);

  attemptSubmit(trigger);
  strictEqual(requested, 1);
});

Deno.test("focus helpers expose deterministic server-safe behavior", () => {
  strictEqual(focusableSelector.includes("button:not([disabled])"), true);
  deepStrictEqual(getFocusableElements(null), []);
  deepStrictEqual(getFocusableElements(), []);
  strictEqual(focusIn([], Focus.First), FocusResult.Error);

  const looseParent = fakeHtmlElement("BUTTON", {
    matches: () => true,
    parentElement: null,
  });
  const child = fakeHtmlElement("SPAN", {
    matches: () => false,
    parentElement: looseParent,
  });
  strictEqual(isFocusableElement(child, FocusableMode.Strict), false);
  strictEqual(isFocusableElement(child, FocusableMode.Loose), true);

  let preventedScroll: boolean | undefined;
  focusElement(
    fakeHtmlElement("BUTTON", {
      focus: (options: FocusOptions) => {
        preventedScroll = options.preventScroll;
      },
    }),
  );
  strictEqual(preventedScroll, true);
});

Deno.test("focus query sorting follows positive tab order then zero", () => {
  const zero = fakeHtmlElement("BUTTON", { tabIndex: 0 });
  const two = fakeHtmlElement("BUTTON", { tabIndex: 2 });
  const one = fakeHtmlElement("BUTTON", { tabIndex: 1 });
  const container = {
    querySelectorAll: () => [zero, two, one],
  } as unknown as HTMLElement;

  strictEqual(getAutoFocusableElements(container)[0], one);
  deepStrictEqual(getAutoFocusableElements(container), [one, two, zero]);
});

Deno.test("DOM ordering does not depend on a global Node constructor", () => {
  const nodes: HTMLElement[] = [];
  for (let index = 0; index < 3; index++) {
    nodes.push(
      fakeHtmlElement("DIV", {
        compareDocumentPosition(other: HTMLElement) {
          const otherIndex = nodes.indexOf(other);
          return index < otherIndex ? 4 : index > otherIndex ? 2 : 0;
        },
      }),
    );
  }

  deepStrictEqual(sortByDomNode([nodes[2], nodes[0], nodes[1]]), nodes);
});
