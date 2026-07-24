import {
  ActivationTrigger,
  MenuActionType,
  type MenuItemDataRef,
  MenuMachine,
  MenuState,
} from "../../src/components/menu/menu-machine.ts";
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

function item(textValue: string, disabled = false): MenuItemDataRef {
  return {
    current: {
      disabled,
      domRef: { current: null },
      textValue,
    },
  };
}

function activeId(machine: MenuMachine): string | undefined {
  return machine.selectors.activeDescendantId(machine.state);
}

Deno.test("Menu machine preserves keyboard, disabled, typeahead, and identity semantics", () => {
  const machine = MenuMachine.create({ id: "pure-menu" });
  const alpha = item("alpha");
  const bravo = item("bravo", true);
  const charlie = item("charlie");

  machine.send({
    focus: { focus: Focus.First },
    type: MenuActionType.OpenMenu,
  });
  machine.send({
    items: [
      { dataRef: alpha, id: "alpha" },
      { dataRef: bravo, id: "bravo" },
      { dataRef: charlie, id: "charlie" },
    ],
    type: MenuActionType.RegisterItems,
  });

  assertEquals(machine.state.menuState, MenuState.Open, "menu opens");
  assertEquals(
    machine.selectors.activeDescendantId(machine.state),
    "alpha",
    "keyboard opening selects first enabled item",
  );

  machine.send({ focus: Focus.Next, type: MenuActionType.GoToItem });
  assertEquals(
    machine.selectors.activeDescendantId(machine.state),
    "charlie",
    "arrow navigation skips disabled items",
  );

  machine.send({ focus: Focus.Nothing, type: MenuActionType.GoToItem });
  machine.send({ type: MenuActionType.Search, value: "c" });
  assertEquals(
    machine.selectors.activeDescendantId(machine.state),
    "charlie",
    "typeahead selects a matching item",
  );
  assertEquals(
    machine.state.activationTrigger,
    ActivationTrigger.Other,
    "typeahead remains a keyboard activation",
  );

  machine.send({ items: ["alpha"], type: MenuActionType.UnregisterItems });
  assertEquals(
    machine.selectors.activeDescendantId(machine.state),
    "charlie",
    "unregistering another item preserves active identity",
  );

  machine.send({ type: MenuActionType.CloseMenu });
  assertEquals(machine.state.menuState, MenuState.Closed, "menu closes");
  assertEquals(machine.state.activeItemIndex, null, "close clears active item");
  machine.dispose();
});

Deno.test("Menu machine resolves every collection focus intent without wrapping", () => {
  const machine = MenuMachine.create({ id: "focus-menu" });
  machine.send({
    focus: { focus: Focus.Last },
    type: MenuActionType.OpenMenu,
  });
  machine.send({
    items: [
      { dataRef: item("alpha"), id: "alpha" },
      { dataRef: item("bravo", true), id: "bravo" },
      { dataRef: item("charlie"), id: "charlie" },
      { dataRef: item("delta"), id: "delta" },
    ],
    type: MenuActionType.RegisterItems,
  });

  assertEquals(
    activeId(machine),
    "delta",
    "last selects the final enabled item",
  );
  machine.send({ focus: Focus.Previous, type: MenuActionType.GoToItem });
  assertEquals(
    activeId(machine),
    "charlie",
    "previous selects the prior enabled item",
  );
  machine.send({ focus: Focus.Previous, type: MenuActionType.GoToItem });
  assertEquals(activeId(machine), "alpha", "previous skips disabled items");
  machine.send({ focus: Focus.Previous, type: MenuActionType.GoToItem });
  assertEquals(activeId(machine), "alpha", "previous does not wrap");
  machine.send({ focus: Focus.Last, type: MenuActionType.GoToItem });
  assertEquals(activeId(machine), "delta", "last can be requested directly");
  machine.send({ focus: Focus.Next, type: MenuActionType.GoToItem });
  assertEquals(activeId(machine), "delta", "next does not wrap");
  machine.send({ focus: Focus.First, type: MenuActionType.GoToItem });
  assertEquals(
    activeId(machine),
    "alpha",
    "first selects the first enabled item",
  );
  machine.send({
    focus: Focus.Specific,
    id: "charlie",
    type: MenuActionType.GoToItem,
  });
  assertEquals(activeId(machine), "charlie", "specific focus resolves by id");
  machine.send({ focus: Focus.Nothing, type: MenuActionType.GoToItem });
  assertEquals(activeId(machine), undefined, "nothing clears the active item");

  machine.dispose();
});

Deno.test("Menu typeahead cycles matches, accumulates queries, and skips disabled items", () => {
  const machine = MenuMachine.create({ id: "search-menu" });
  machine.send({
    focus: { focus: Focus.First },
    type: MenuActionType.OpenMenu,
  });
  machine.send({
    items: [
      { dataRef: item("alpha"), id: "alpha" },
      { dataRef: item("bravo disabled", true), id: "bravo-disabled" },
      { dataRef: item("bravo one"), id: "bravo-one" },
      { dataRef: item("bravo two"), id: "bravo-two" },
      { dataRef: item("charlie command"), id: "charlie" },
    ],
    type: MenuActionType.RegisterItems,
  });

  machine.send({ type: MenuActionType.Search, value: "B" });
  assertEquals(activeId(machine), "bravo-one", "search is case insensitive");
  machine.send({ type: MenuActionType.ClearSearch });
  machine.send({ type: MenuActionType.Search, value: "b" });
  assertEquals(
    activeId(machine),
    "bravo-two",
    "a fresh query cycles to the next match",
  );
  machine.send({ type: MenuActionType.ClearSearch });
  machine.send({ type: MenuActionType.Search, value: "c" });
  machine.send({ type: MenuActionType.Search, value: "h" });
  assertEquals(activeId(machine), "charlie", "search characters accumulate");
  assertEquals(
    machine.state.searchQuery,
    "ch",
    "the accumulated query is retained",
  );
  machine.send({ type: MenuActionType.ClearSearch });
  for (const character of "charlie ") {
    machine.send({ type: MenuActionType.Search, value: character });
  }
  assertEquals(
    activeId(machine),
    "charlie",
    "search supports words with spaces",
  );
  machine.send({ type: MenuActionType.ClearSearch });
  assertEquals(machine.state.searchQuery, "", "clear search resets the query");

  machine.dispose();
});

Deno.test("Menu machine ignores navigation while closed and handles all-disabled collections", () => {
  const machine = MenuMachine.create({ id: "guarded-menu" });
  machine.send({
    items: [
      { dataRef: item("alpha", true), id: "alpha" },
      { dataRef: item("bravo", true), id: "bravo" },
    ],
    type: MenuActionType.RegisterItems,
  });
  machine.send({ focus: Focus.First, type: MenuActionType.GoToItem });
  assertEquals(activeId(machine), undefined, "closed menus ignore navigation");
  machine.send({
    focus: { focus: Focus.First },
    type: MenuActionType.OpenMenu,
  });
  assertEquals(
    activeId(machine),
    undefined,
    "all-disabled menus have no active item",
  );
  machine.send({ type: MenuActionType.Search, value: "a" });
  assertEquals(
    activeId(machine),
    undefined,
    "typeahead cannot select disabled items",
  );

  machine.dispose();
});

Deno.test("Menu machine preserves opening focus across incremental registration", () => {
  const first = MenuMachine.create({ id: "incremental-first-menu" });
  first.send({
    focus: { focus: Focus.First },
    type: MenuActionType.OpenMenu,
  });
  first.send({
    items: [{ dataRef: item("disabled", true), id: "disabled" }],
    type: MenuActionType.RegisterItems,
  });
  assertEquals(
    activeId(first),
    undefined,
    "a disabled first registration does not consume Focus.First",
  );
  first.send({
    items: [{ dataRef: item("alpha"), id: "alpha" }],
    type: MenuActionType.RegisterItems,
  });
  first.send({
    items: [{ dataRef: item("omega"), id: "omega" }],
    type: MenuActionType.RegisterItems,
  });
  assertEquals(
    activeId(first),
    "alpha",
    "Focus.First follows the growing collection to its first enabled item",
  );
  first.send({ type: MenuActionType.SortItems });
  assertEquals(
    first.state.pendingFocus.focus,
    Focus.Nothing,
    "the registration-frame sort consumes Focus.First",
  );
  first.dispose();

  const last = MenuMachine.create({ id: "incremental-last-menu" });
  last.send({
    focus: { focus: Focus.Last },
    type: MenuActionType.OpenMenu,
  });
  last.send({
    items: [{ dataRef: item("alpha"), id: "alpha" }],
    type: MenuActionType.RegisterItems,
  });
  last.send({
    items: [{ dataRef: item("omega"), id: "omega" }],
    type: MenuActionType.RegisterItems,
  });
  assertEquals(
    activeId(last),
    "omega",
    "Focus.Last follows the growing collection to its last enabled item",
  );
  last.send({ type: MenuActionType.SortItems });
  assertEquals(
    last.state.pendingFocus.focus,
    Focus.Nothing,
    "the registration-frame sort consumes Focus.Last",
  );
  last.dispose();

  const mounted = MenuMachine.create({ id: "registered-menu" });
  mounted.send({
    items: [
      { dataRef: item("alpha"), id: "alpha" },
      { dataRef: item("omega"), id: "omega" },
    ],
    type: MenuActionType.RegisterItems,
  });
  mounted.send({ type: MenuActionType.SortItems });
  mounted.send({
    focus: { focus: Focus.Last },
    type: MenuActionType.OpenMenu,
  });
  assertEquals(
    activeId(mounted),
    "omega",
    "opening a statically mounted collection resolves focus immediately",
  );
  mounted.dispose();
});

Deno.test("Menu disposal releases global stack membership", () => {
  const previousEnv = env.current;
  env.set("client");
  const id = "disposed-menu";
  const stack = stackMachines.get(null);
  stack.actions.pop(id);
  let machine: MenuMachine | undefined;

  try {
    machine = MenuMachine.create({ id });
    machine.send({
      focus: { focus: Focus.Nothing },
      type: MenuActionType.OpenMenu,
    });
    assert(
      stack.selectors.inStack(stack.state, id),
      "an open menu joins the global stack",
    );

    machine.dispose();
    assert(
      !stack.selectors.inStack(stack.state, id),
      "disposing an open menu removes its stack entry",
    );
  } finally {
    machine?.dispose();
    stack.actions.pop(id);
    env.set(previousEnv);
  }
});
