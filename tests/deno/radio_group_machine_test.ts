import {
  compareRadioValues,
  radioFormValue,
  resolveRadioTabIndex,
} from "../../src/components/radio-group/radio-group-machine.ts";

function strictEqual(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Expected ${JSON.stringify(actual)} to strictly equal ${
        JSON.stringify(expected)
      }`,
    );
  }
}

Deno.test("RadioGroup comparator preserves primitive and default id behavior", () => {
  strictEqual(compareRadioValues(undefined, "a", "a"), true);
  strictEqual(compareRadioValues(undefined, "a", "b"), false);
  strictEqual(
    compareRadioValues(undefined, { id: 2, name: "Old" }, {
      id: 2,
      name: "New",
    }),
    true,
  );
  strictEqual(
    compareRadioValues(undefined, { id: 2 }, { id: 3 }),
    false,
  );
});

Deno.test("RadioGroup comparator supports property and callback comparators", () => {
  strictEqual(
    compareRadioValues("code", { code: "il", name: "Israel" }, {
      code: "il",
      name: "Israël",
    }),
    true,
  );
  strictEqual(
    compareRadioValues(
      (left: { score: number }, right: { score: number }) =>
        Math.floor(left.score) === Math.floor(right.score),
      { score: 1.2 },
      { score: 1.8 },
    ),
    true,
  );
});

Deno.test("RadioGroup roving tabindex chooses checked then first enabled", () => {
  strictEqual(
    resolveRadioTabIndex({
      checked: false,
      containsCheckedOption: false,
      disabled: false,
      isFirstOption: true,
      tabIndex: 3,
    }),
    3,
  );
  strictEqual(
    resolveRadioTabIndex({
      checked: true,
      containsCheckedOption: true,
      disabled: false,
      isFirstOption: false,
      tabIndex: 0,
    }),
    0,
  );
  strictEqual(
    resolveRadioTabIndex({
      checked: false,
      containsCheckedOption: true,
      disabled: false,
      isFirstOption: true,
      tabIndex: 0,
    }),
    -1,
  );
  strictEqual(
    resolveRadioTabIndex({
      checked: true,
      containsCheckedOption: true,
      disabled: true,
      isFirstOption: true,
      tabIndex: 0,
    }),
    -1,
  );
});

Deno.test("RadioGroup form fallback preserves explicit falsy values", () => {
  strictEqual(radioFormValue(undefined), "on");
  strictEqual(radioFormValue(null), "on");
  strictEqual(radioFormValue(false), false);
  strictEqual(radioFormValue(0), 0);
  strictEqual(radioFormValue(""), "");
  strictEqual(radioFormValue("pickup"), "pickup");
});
