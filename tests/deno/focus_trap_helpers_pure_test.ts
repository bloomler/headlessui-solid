import {
  containsFocusTrapTarget,
  resolveFocusTrapContainers,
  resolveFocusTrapElement,
} from "../../src/internal/focus-trap-helpers.ts";
import { FocusTrapFeatures } from "../../src/components/focus-trap/focus-trap-features.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fakeElement(name: string, descendants: Element[] = []): Element {
  return {
    accessKey: "",
    contains(target: Element) {
      return target === this || descendants.includes(target);
    },
    isConnected: true,
    nodeType: 1,
    tagName: name.toUpperCase(),
  } as unknown as Element;
}

Deno.test("FocusTrap container resolution supports Solid accessors and ref sets", () => {
  const first = fakeElement("section");
  const second = fakeElement("aside");
  const invalid = { current: null };

  const direct = resolveFocusTrapContainers([first, () => second, invalid]);
  assert(
    direct.size === 2,
    `Expected two direct containers, got ${direct.size}`,
  );
  assert(direct.has(first), "Missing direct container");
  assert(direct.has(second), "Missing accessor container");

  const lazy = resolveFocusTrapContainers(() => [first, second]);
  assert(lazy.size === 2, `Expected two lazy containers, got ${lazy.size}`);

  const refs = resolveFocusTrapContainers({
    current: new Set([{ current: first }, { current: second }, invalid]),
  });
  assert(refs.size === 2, `Expected two ref containers, got ${refs.size}`);
});

Deno.test("FocusTrap containment and focus-reference resolution stay DOM-global safe", () => {
  const child = fakeElement("button");
  const container = fakeElement("div", [child]);
  const outside = fakeElement("button");

  assert(
    containsFocusTrapTarget([container], child),
    "Expected descendant containment",
  );
  assert(
    !containsFocusTrapTarget([container], outside),
    "Unexpected outside containment",
  );

  const focusable = child as unknown as HTMLElement;
  assert(
    resolveFocusTrapElement(focusable) === focusable,
    "Direct focus target failed",
  );
  assert(
    resolveFocusTrapElement({ current: focusable }) === focusable,
    "Ref focus target failed",
  );
  assert(
    resolveFocusTrapElement(() => focusable) === focusable,
    "Accessor focus target failed",
  );
  assert(resolveFocusTrapElement(null) === null, "Null focus target failed");
});

Deno.test("FocusTrapFeatures retain the upstream bit contract", () => {
  assert(FocusTrapFeatures.None === 0, "None bit changed");
  assert(FocusTrapFeatures.InitialFocus === 1, "InitialFocus bit changed");
  assert(FocusTrapFeatures.TabLock === 2, "TabLock bit changed");
  assert(FocusTrapFeatures.FocusLock === 4, "FocusLock bit changed");
  assert(FocusTrapFeatures.RestoreFocus === 8, "RestoreFocus bit changed");
  assert(FocusTrapFeatures.AutoFocus === 16, "AutoFocus bit changed");
});
