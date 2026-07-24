import {
  resolveReorderedTabIndex,
  resolveTabFocusIntent,
  resolveTabSelectionIndex,
} from "../../src/components/tabs/tabs-machine.ts";

function strictEqual(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Expected ${JSON.stringify(actual)} to strictly equal ${
        JSON.stringify(expected)
      }`,
    );
  }
}

const enabled = { disabled: false };
const disabled = { disabled: true };

Deno.test("Tabs selection resolves initial underflow and overflow", () => {
  strictEqual(resolveTabSelectionIndex(-2, -2, [enabled, enabled, enabled]), 0);
  strictEqual(resolveTabSelectionIndex(5, 5, [enabled, enabled, enabled]), 2);
});

Deno.test("Tabs selection wraps controlled increments and decrements", () => {
  strictEqual(resolveTabSelectionIndex(2, 3, [enabled, enabled, enabled]), 0);
  strictEqual(resolveTabSelectionIndex(0, -1, [enabled, enabled, enabled]), 2);
});

Deno.test("Tabs selection skips disabled candidates and wraps forward", () => {
  strictEqual(
    resolveTabSelectionIndex(0, 0, [disabled, enabled, enabled]),
    1,
  );
  strictEqual(
    resolveTabSelectionIndex(2, 2, [enabled, enabled, disabled]),
    0,
  );
  strictEqual(
    resolveTabSelectionIndex(1, 1, [disabled, disabled, disabled]),
    1,
  );
});

Deno.test("Tabs selection follows an existing tab across DOM reordering", () => {
  const alpha = { id: "alpha" };
  const beta = { id: "beta" };
  const gamma = { id: "gamma" };
  strictEqual(
    resolveReorderedTabIndex(
      [alpha, beta, gamma],
      [gamma, beta, alpha],
      0,
    ),
    2,
  );
  strictEqual(
    resolveReorderedTabIndex([alpha], [gamma], 0),
    0,
  );
});

Deno.test("Tabs keyboard intent respects orientation and boundary keys", () => {
  strictEqual(resolveTabFocusIntent("horizontal", "ArrowRight"), "next");
  strictEqual(resolveTabFocusIntent("horizontal", "ArrowLeft"), "previous");
  strictEqual(resolveTabFocusIntent("horizontal", "ArrowDown"), null);
  strictEqual(resolveTabFocusIntent("vertical", "ArrowDown"), "next");
  strictEqual(resolveTabFocusIntent("vertical", "ArrowUp"), "previous");
  strictEqual(resolveTabFocusIntent("vertical", "ArrowRight"), null);
  strictEqual(resolveTabFocusIntent("vertical", "Home"), "first");
  strictEqual(resolveTabFocusIntent("horizontal", "PageDown"), "last");
});

Deno.test("Tabs keyboard aliases and irrelevant orientation keys form a complete matrix", () => {
  for (const orientation of ["horizontal", "vertical"] as const) {
    strictEqual(resolveTabFocusIntent(orientation, "Home"), "first");
    strictEqual(resolveTabFocusIntent(orientation, "PageUp"), "first");
    strictEqual(resolveTabFocusIntent(orientation, "End"), "last");
    strictEqual(resolveTabFocusIntent(orientation, "PageDown"), "last");
    strictEqual(resolveTabFocusIntent(orientation, "Enter"), null);
    strictEqual(resolveTabFocusIntent(orientation, " "), null);
    strictEqual(resolveTabFocusIntent(orientation, "Escape"), null);
  }
  strictEqual(resolveTabFocusIntent("horizontal", "ArrowUp"), null);
  strictEqual(resolveTabFocusIntent("horizontal", "ArrowDown"), null);
  strictEqual(resolveTabFocusIntent("vertical", "ArrowLeft"), null);
  strictEqual(resolveTabFocusIntent("vertical", "ArrowRight"), null);
});

Deno.test("Tabs selection keeps the current index for empty and all-disabled collections", () => {
  strictEqual(resolveTabSelectionIndex(4, 0, []), 4);
  strictEqual(
    resolveTabSelectionIndex(1, 0, [disabled, disabled, disabled]),
    1,
  );
  strictEqual(
    resolveTabSelectionIndex(1, 9, [disabled, disabled, disabled]),
    1,
  );
});
