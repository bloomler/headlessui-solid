import { Focus } from "../../src/utils/calculate-active-index.ts";
import {
  compareListboxValues,
  ListboxMachine,
  ListboxState,
  toggleListboxValue,
  ValueMode,
} from "../../src/components/listbox/listbox-machine.ts";
import { stackMachines } from "../../src/machines/stack-machine.ts";
import { env } from "../../src/utils/env.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown): void {
  assert(
    Object.is(actual, expected),
    `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`,
  );
}

Deno.test("Listbox comparators preserve property, function, id, and primitive semantics", () => {
  equal(compareListboxValues("key", { key: 1 }, { key: 1 }), true);
  equal(compareListboxValues("key", { key: 1 }, { key: 2 }), false);
  equal(
    compareListboxValues(
      (a: string, z: string) => a.toLowerCase() === z.toLowerCase(),
      "ALPHA",
      "alpha",
    ),
    true,
  );
  equal(compareListboxValues(undefined, { id: 3 }, { id: 3 }), true);
  equal(compareListboxValues(undefined, 0, -0), true);
  equal(compareListboxValues(undefined, null, null), true);
  equal(compareListboxValues(undefined, null, { id: 3 }), false);
  equal(compareListboxValues(undefined, { id: 3 }, null), false);
});

Deno.test("Listbox multi values toggle immutably with the configured comparator", () => {
  const source = [{ id: 1 }, { id: 2 }];
  const removed = toggleListboxValue(
    source,
    { id: 1 },
    (a, z) => a.id === z.id,
  );
  equal(source.length, 2);
  equal(removed.length, 1);
  equal(removed[0].id, 2);
  const added = toggleListboxValue(
    removed,
    { id: 3 },
    (a, z) => a.id === z.id,
  );
  equal(added.length, 2);
  equal(added[1].id, 3);
});

Deno.test("Listbox machine skips disabled options and supports typeahead", () => {
  const machine = ListboxMachine.create<string>({ id: "plans" });
  const selected = new Set<string>();
  machine.state.dataRef.current = {
    compare: Object.is,
    disabled: false,
    invalid: false,
    isSelected: (value) => selected.has(value),
    listRef: { current: new Map() },
    mode: ValueMode.Single,
    onChange: () => {},
    optionsPropsRef: { current: { hold: false, static: false } },
    orientation: "vertical",
    value: undefined,
  };
  const option = (value: string, disabled = false) => ({
    current: {
      disabled,
      domRef: { current: null },
      textValue: value,
      value,
    },
  });
  machine.actions.openListbox({ focus: Focus.First });
  machine.actions.registerOption("beta", option("beta", true));
  machine.actions.registerOption("alpha", option("alpha"));
  machine.actions.registerOption("gamma", option("gamma"));
  equal(machine.state.listboxState, ListboxState.Open);
  equal(machine.selectors.activeDescendantId(machine.state), "alpha");
  machine.actions.goToOption({ focus: Focus.Next });
  equal(machine.selectors.activeDescendantId(machine.state), "gamma");
  machine.actions.search("a");
  equal(machine.selectors.activeDescendantId(machine.state), "alpha");
  machine.actions.clearSearch();
  equal(machine.state.searchQuery, "");
  machine.dispose();
});

Deno.test("Listbox machine resolves first, previous, next, last, specific, and nothing focus", () => {
  const machine = ListboxMachine.create<string>({ id: "focus-plans" });
  const option = (value: string, disabled = false) => ({
    current: {
      disabled,
      domRef: { current: null },
      textValue: value,
      value,
    },
  });
  machine.actions.openListbox({ focus: Focus.Last });
  machine.actions.registerOption("alpha", option("alpha"));
  machine.actions.registerOption("bravo", option("bravo", true));
  machine.actions.registerOption("charlie", option("charlie"));
  machine.actions.registerOption("delta", option("delta"));
  machine.actions.sortOptions();

  equal(machine.selectors.activeDescendantId(machine.state), "delta");
  machine.actions.goToOption({ focus: Focus.Previous });
  equal(machine.selectors.activeDescendantId(machine.state), "charlie");
  machine.actions.goToOption({ focus: Focus.Previous });
  equal(machine.selectors.activeDescendantId(machine.state), "alpha");
  machine.actions.goToOption({ focus: Focus.Previous });
  equal(machine.selectors.activeDescendantId(machine.state), "alpha");
  machine.actions.goToOption({ focus: Focus.Last });
  machine.actions.goToOption({ focus: Focus.Next });
  equal(machine.selectors.activeDescendantId(machine.state), "delta");
  machine.actions.goToOption({ focus: Focus.First });
  equal(machine.selectors.activeDescendantId(machine.state), "alpha");
  machine.actions.goToOption({ focus: Focus.Specific, id: "charlie" });
  equal(machine.selectors.activeDescendantId(machine.state), "charlie");
  machine.actions.goToOption({ focus: Focus.Nothing });
  equal(machine.selectors.activeDescendantId(machine.state), undefined);

  machine.dispose();
});

Deno.test("Listbox typeahead cycles, accumulates, and excludes disabled matches", () => {
  const machine = ListboxMachine.create<string>({ id: "search-plans" });
  const option = (value: string, disabled = false) => ({
    current: {
      disabled,
      domRef: { current: null },
      textValue: value,
      value,
    },
  });
  machine.actions.openListbox({ focus: Focus.First });
  machine.actions.registerOption("alpha", option("alpha"));
  machine.actions.registerOption(
    "bravo-disabled",
    option("bravo disabled", true),
  );
  machine.actions.registerOption("bravo-one", option("bravo one"));
  machine.actions.registerOption("bravo-two", option("bravo two"));
  machine.actions.registerOption("charlie", option("charlie command"));

  machine.actions.search("B");
  equal(machine.selectors.activeDescendantId(machine.state), "bravo-one");
  machine.actions.clearSearch();
  machine.actions.search("b");
  equal(machine.selectors.activeDescendantId(machine.state), "bravo-two");
  machine.actions.clearSearch();
  machine.actions.search("c");
  machine.actions.search("h");
  equal(machine.selectors.activeDescendantId(machine.state), "charlie");
  equal(machine.state.searchQuery, "ch");
  machine.actions.clearSearch();
  for (const character of "charlie ") machine.actions.search(character);
  equal(machine.selectors.activeDescendantId(machine.state), "charlie");
  machine.actions.clearSearch();
  equal(machine.state.searchQuery, "");

  machine.dispose();
});

Deno.test("Listbox opens on the selected option and freezes single activation", () => {
  const machine = ListboxMachine.create<string>({ id: "selected-plan" });
  machine.state.dataRef.current = {
    compare: Object.is,
    disabled: false,
    invalid: false,
    isSelected: (value) => value === "charlie",
    listRef: { current: new Map() },
    mode: ValueMode.Single,
    onChange: () => {},
    optionsPropsRef: { current: { hold: false, static: false } },
    orientation: "vertical",
    value: "charlie",
  };
  const option = (value: string) => ({
    current: {
      disabled: false,
      domRef: { current: null },
      textValue: value,
      value,
    },
  });
  machine.actions.registerOption("alpha", option("alpha"));
  machine.actions.registerOption("charlie", option("charlie"));
  machine.actions.openListbox({ focus: Focus.Nothing });
  equal(machine.selectors.activeDescendantId(machine.state), "charlie");
  machine.actions.selectActiveOption();
  equal(machine.selectors.hasFrozenValue(machine.state), true);

  machine.dispose();
});

Deno.test("Listbox guards closed and all-disabled collections", () => {
  const machine = ListboxMachine.create<string>({ id: "guarded-plans" });
  const option = (value: string) => ({
    current: {
      disabled: true,
      domRef: { current: null },
      textValue: value,
      value,
    },
  });
  machine.actions.registerOption("alpha", option("alpha"));
  machine.actions.registerOption("bravo", option("bravo"));
  machine.actions.goToOption({ focus: Focus.First });
  equal(machine.selectors.activeDescendantId(machine.state), undefined);
  machine.actions.openListbox({ focus: Focus.First });
  equal(machine.selectors.activeDescendantId(machine.state), undefined);
  machine.actions.search("a");
  equal(machine.selectors.activeDescendantId(machine.state), undefined);

  machine.dispose();
});

Deno.test("Listbox machine guards disabled roots and freezes single selection", () => {
  const machine = ListboxMachine.create<string>({ id: "disabled" });
  machine.state.dataRef.current = {
    compare: Object.is,
    disabled: true,
    invalid: false,
    isSelected: () => false,
    listRef: { current: new Map() },
    mode: ValueMode.Single,
    onChange: () => {},
    optionsPropsRef: { current: { hold: false, static: false } },
    orientation: "vertical",
    value: undefined,
  };
  machine.actions.openListbox({ focus: Focus.First });
  equal(machine.state.listboxState, ListboxState.Closed);
  machine.state.dataRef.current = {
    ...machine.state.dataRef.current,
    disabled: false,
  };
  machine.actions.openListbox({ focus: Focus.Nothing });
  machine.actions.selectOption("alpha");
  equal(machine.selectors.hasFrozenValue(machine.state), true);
  machine.dispose();
});

Deno.test("Listbox disposal releases its stack entry and pending registration frame", () => {
  const previousEnv = env.current;
  const requestAnimationFrameDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "requestAnimationFrame",
  );
  const cancelAnimationFrameDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "cancelAnimationFrame",
  );
  const pendingFrames = new Set<number>();
  let nextFrame = 0;

  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (_callback: FrameRequestCallback) => {
      const frame = ++nextFrame;
      pendingFrames.add(frame);
      return frame;
    },
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: (frame: number) => {
      pendingFrames.delete(frame);
    },
  });

  env.set("client");
  const id = "disposed-listbox";
  const stack = stackMachines.get(null);
  stack.actions.pop(id);
  let machine: ListboxMachine<string> | undefined;

  try {
    machine = ListboxMachine.create<string>({ id });
    machine.actions.openListbox({ focus: Focus.Nothing });
    machine.actions.registerOption("alpha", {
      current: {
        disabled: false,
        domRef: { current: null },
        textValue: "alpha",
        value: "alpha",
      },
    });

    assert(
      stack.selectors.inStack(stack.state, id),
      "an open listbox joins the global stack",
    );
    equal(pendingFrames.size, 1);

    machine.dispose();
    assert(
      !stack.selectors.inStack(stack.state, id),
      "disposing an open listbox removes its stack entry",
    );
    equal(pendingFrames.size, 0);
  } finally {
    machine?.dispose();
    stack.actions.pop(id);
    env.set(previousEnv);
    if (requestAnimationFrameDescriptor) {
      Object.defineProperty(
        globalThis,
        "requestAnimationFrame",
        requestAnimationFrameDescriptor,
      );
    } else {
      Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    }
    if (cancelAnimationFrameDescriptor) {
      Object.defineProperty(
        globalThis,
        "cancelAnimationFrame",
        cancelAnimationFrameDescriptor,
      );
    } else {
      Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
    }
  }
});
