import {
  ActivationTrigger,
  ComboboxMachine,
  type ComboboxMachineData,
  type ComboboxOptionDataRef,
  ComboboxState,
  ValueMode,
} from "../../src/components/combobox/combobox-machine.ts";
import { ComboboxVirtualizer } from "../../src/components/combobox/combobox-virtualizer.ts";
import { stackMachines } from "../../src/machines/stack-machine.ts";
import { Focus } from "../../src/utils/calculate-active-index.ts";
import { env } from "../../src/utils/env.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    `${message}: expected ${JSON.stringify(expected)}, received ${
      JSON.stringify(actual)
    }`,
  );
}

function option<T>(
  value: T,
  options: { disabled?: boolean; order?: number } = {},
): ComboboxOptionDataRef<T> {
  return {
    current: {
      disabled: options.disabled ?? false,
      domRef: { current: null },
      order: options.order ?? null,
      value,
    },
  };
}

function data<T>(options: {
  mode?: ValueMode;
  onChange(value: T | T[] | null): void;
  value: T | readonly T[] | null | undefined;
}): ComboboxMachineData<T> {
  const records = new Map<T, number>();
  return {
    __demoMode: false,
    calculateIndex(value) {
      return records.get(value as T) ?? -1;
    },
    compare: Object.is,
    defaultValue: undefined,
    disabled: false,
    immediate: false,
    invalid: false,
    isSelected(value) {
      return Array.isArray(options.value)
        ? options.value.includes(value as T)
        : Object.is(options.value, value);
    },
    mode: options.mode ?? ValueMode.Single,
    onChange: options.onChange,
    optionsPropsRef: { current: { hold: false, static: false } },
    value: options.value,
    virtual: null,
  };
}

Deno.test("Combobox machine preserves selection, disabled navigation, ordering, and multiple toggles", () => {
  const changes: unknown[] = [];
  const machine = ComboboxMachine.create<string>({ id: "pure-combobox" });
  machine.state.dataRef.current = data({
    onChange: (value) => changes.push(value),
    value: "bravo",
  });
  machine.actions.registerOption("charlie", option("charlie", { order: 3 }));
  machine.actions.registerOption("alpha", option("alpha", { order: 1 }));
  machine.actions.registerOption(
    "bravo",
    option("bravo", { disabled: true, order: 2 }),
  );

  machine.actions.openCombobox();
  assertEquals(machine.state.comboboxState, ComboboxState.Open, "opens");
  assertEquals(
    machine.selectors.activeOption(machine.state),
    "bravo",
    "selected identity becomes active even when disabled",
  );
  machine.actions.goToOption({ focus: Focus.Next });
  assertEquals(
    machine.selectors.activeOption(machine.state),
    "charlie",
    "navigation follows explicit order and skips disabled options",
  );
  machine.actions.selectActiveOption();
  assertEquals(changes.at(-1), "charlie", "active option commits");

  machine.state.dataRef.current = data({
    mode: ValueMode.Multi,
    onChange: (value) => changes.push(value),
    value: ["alpha"],
  });
  machine.actions.change("charlie");
  assertEquals(
    JSON.stringify(changes.at(-1)),
    JSON.stringify(["alpha", "charlie"]),
    "multiple mode adds values",
  );
  machine.actions.change("alpha");
  assertEquals(
    JSON.stringify(changes.at(-1)),
    JSON.stringify([]),
    "multiple mode toggles values against the current controlled snapshot",
  );
  machine.dispose();
});

Deno.test("Combobox virtual state preserves active identity across filtering", () => {
  const alpha = { id: 1 };
  const bravo = { id: 2 };
  const charlie = { id: 3 };
  const machine = ComboboxMachine.create<typeof alpha>({
    id: "virtual-combobox",
    virtual: { options: [alpha, bravo, charlie] },
  });
  machine.state.dataRef.current = {
    ...data<typeof alpha>({ onChange: () => {}, value: null }),
    compare(left, right) {
      return (left as typeof alpha).id === (right as typeof alpha).id;
    },
    calculateIndex(value) {
      return machine.state.virtual?.options.findIndex((option) =>
        option.id === (value as typeof alpha).id
      ) ?? -1;
    },
    virtual: machine.state.virtual,
  };
  machine.actions.openCombobox();
  machine.actions.goToOption({ focus: Focus.Specific, idx: 1 });
  const replacementBravo = { ...bravo };
  machine.actions.updateVirtualConfiguration(
    [replacementBravo, { ...charlie }],
    null,
  );
  assertEquals(machine.state.activeOptionIndex, 0, "active index is remapped");
  assertEquals(
    machine.selectors.activeOption(machine.state),
    replacementBravo,
    "active virtual value keeps comparator identity",
  );
  machine.actions.setActivationTrigger(ActivationTrigger.Pointer);
  assertEquals(
    machine.state.activationTrigger,
    ActivationTrigger.Pointer,
    "virtual pointer activation is represented",
  );
  machine.dispose();
});

Deno.test("Combobox commits an explicitly registered undefined value", () => {
  const changes: unknown[] = [];
  const machine = ComboboxMachine.create<string | undefined>({
    id: "undefined-value-combobox",
  });
  machine.state.dataRef.current = data<string | undefined>({
    onChange: (value) => changes.push(value),
    value: null,
  });
  machine.actions.registerOption("undefined-option", option(undefined));
  machine.actions.openCombobox();
  machine.actions.goToOption({ focus: Focus.First });
  machine.actions.selectActiveOption();
  assertEquals(changes.length, 1, "selection emits exactly once");
  assertEquals(changes[0], undefined, "undefined is a valid option value");
  machine.dispose();
});

Deno.test("Combobox virtualizer measures rows, overscans, and scrolls with padding", () => {
  const virtualizer = new ComboboxVirtualizer({
    count: 100,
    estimateSize: 40,
    overscan: 2,
  });
  virtualizer.configure({
    count: 100,
    paddingEnd: 8,
    paddingStart: 12,
    scrollTop: 412,
    viewportSize: 120,
  });
  assert(virtualizer.measure(10, 80), "first measurement changes layout");
  assertEquals(virtualizer.item(11)?.start, 480, "measured row shifts offsets");
  const indices = virtualizer.indices();
  assert(indices.includes(8), "range includes leading overscan");
  assert(indices.includes(13), "range includes trailing overscan");
  const repeatedIndices = virtualizer.indices();
  assert(
    indices.every((index, position) =>
      Object.is(index, repeatedIndices[position])
    ),
    "virtual rows expose stable primitive reconciliation keys",
  );
  assert(
    virtualizer.indices(99).includes(99),
    "the active row remains keyed when it is outside the viewport",
  );
  assertEquals(
    virtualizer.scrollOffsetForIndex(0),
    12,
    "scrolling upward accounts for start padding",
  );
  assert(
    (virtualizer.scrollOffsetForIndex(99) ?? 0) > 3_000,
    "scrolling to a distant option uses measured total geometry",
  );
  assertEquals(virtualizer.totalSize(), 4_040, "total uses measured height");
});

Deno.test("Combobox disposal releases global stack membership", () => {
  const previousEnv = env.current;
  env.set("client");
  const id = "disposed-combobox";
  const stack = stackMachines.get(null);
  stack.actions.pop(id);
  let machine: ComboboxMachine<string> | undefined;

  try {
    machine = ComboboxMachine.create<string>({ id });
    machine.actions.openCombobox();
    assert(
      stack.selectors.inStack(stack.state, id),
      "an open combobox joins the global stack",
    );

    machine.dispose();
    assert(
      !stack.selectors.inStack(stack.state, id),
      "disposing an open combobox removes its stack entry",
    );
  } finally {
    machine?.dispose();
    stack.actions.pop(id);
    env.set(previousEnv);
  }
});
