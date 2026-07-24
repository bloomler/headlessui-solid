import {
  createTransitionNesting,
  createTransitionRegistration,
  TransitionTreeState,
} from "../../src/internal/transition-nesting.ts";
import {
  resolveTransitionClasses,
  type TransitionData,
  transitionDataAttributes,
} from "../../src/primitives/transition.ts";

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

Deno.test("Transition phase classes and data attributes match Headless UI states", () => {
  const classes = {
    enter: "enter shared",
    enterFrom: "from shared",
    enterTo: "to",
    entered: "entered",
    leave: "leave shared",
    leaveFrom: "from-leave",
    leaveTo: "to-leave",
  };

  const classList = (data: TransitionData, show: boolean, immediate = false) =>
    resolveTransitionClasses({ classes, data, immediate, show });

  assertEquals(
    classList({ enter: true, closed: true, transition: true }, true),
    "enter shared from",
    "closed enter classes",
  );
  assertEquals(
    classList({ enter: true, closed: false, transition: true }, true),
    "enter shared to",
    "open enter classes",
  );
  assertEquals(
    classList({ leave: true, closed: false, transition: true }, false),
    "leave shared from-leave",
    "open leave classes",
  );
  assertEquals(
    classList({ leave: true, closed: true, transition: true }, false),
    "leave shared to-leave",
    "closed leave classes",
  );
  assertEquals(
    classList({}, true),
    "entered",
    "idle shown classes",
  );
  assertEquals(
    classList({}, true, true),
    "enter shared from entered",
    "SSR appear classes",
  );

  const attributes = transitionDataAttributes({
    closed: true,
    enter: false,
    leave: true,
    transition: true,
  });
  assertEquals(attributes["data-closed"], "", "closed data attribute");
  assertEquals(attributes["data-leave"], "", "leave data attribute");
  assertEquals(
    attributes["data-transition"],
    "",
    "transition data attribute",
  );
  assert(
    !("data-enter" in attributes),
    "false transition data must be omitted",
  );
});

Deno.test("Transition nesting waits for every child and resolves superseded work", async () => {
  let emptyCalls = 0;
  const nesting = createTransitionNesting(() => emptyCalls += 1);
  const element = {} as HTMLElement;
  const first = createTransitionRegistration(
    () => element,
    TransitionTreeState.Visible,
  );
  const second = createTransitionRegistration(
    () => element,
    TransitionTreeState.Visible,
  );
  const unregisterFirst = nesting.register(first);
  const unregisterSecond = nesting.register(second);

  const firstLeave = nesting.start(first, "leave");
  const secondLeave = nesting.start(second, "leave");
  let leavesSettled = false;
  const leaves = nesting.waitForChildren("leave").then(() => {
    leavesSettled = true;
  });

  await Promise.resolve();
  nesting.settle(first, firstLeave);
  await Promise.resolve();
  assert(!leavesSettled, "one pending child must keep its parent visible");

  nesting.settle(second, secondLeave);
  await leaves;
  assert(leavesSettled, "all settled children release the parent");

  // A real Transition child marks itself hidden immediately after its
  // completed leave. Start the reversal scenario from that stable state.
  nesting.markHidden(first);
  nesting.markHidden(second);
  await Promise.resolve();
  assert(emptyCalls > 0, "hiding the final child notifies the parent");
  nesting.markVisible(first);

  const supersededLeave = nesting.start(first, "leave");
  const staleWait = nesting.waitForChildren("leave");
  const enter = nesting.start(first, "enter");
  await staleWait;
  nesting.settle(first, supersededLeave);
  assert(
    first.pending?.token === enter,
    "a stale token cannot settle a reversal",
  );
  nesting.settle(first, enter);

  nesting.markHidden(first);

  unregisterFirst();
  unregisterSecond();
});

Deno.test("Transition nesting waits for visible children to publish leave work", async () => {
  const nesting = createTransitionNesting();
  const element = {} as HTMLElement;
  const child = createTransitionRegistration(
    () => element,
    TransitionTreeState.Visible,
  );
  const unregister = nesting.register(child);
  let settled = false;
  const leave = nesting.waitForChildren("leave").then(() => {
    settled = true;
  });

  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert(!settled, "the boundary must not hide before its child starts leave");

  const token = nesting.start(child, "leave");
  await Promise.resolve();
  assert(!settled, "published leave work must keep the boundary visible");

  nesting.settle(child, token);
  await leave;
  assert(settled, "settled leave work releases the boundary");
  unregister();
});

Deno.test("Transition class lists preserve newline-delimited upstream tokens", () => {
  const resolved = resolveTransitionClasses({
    classes: {
      enter: "enter\nshared",
      enterFrom: "enter-from\nshared",
      enterTo: "enter-to",
      entered: "entered\nsettled",
    },
    data: { closed: true, enter: true, transition: true },
    immediate: false,
    show: true,
  });
  const tokens = new Set(resolved?.split(/\s+/));

  for (const expected of ["enter", "shared", "enter-from"]) {
    assert(tokens.has(expected), `Missing transition class ${expected}`);
  }
  assert(!tokens.has("enter-to"), "Enter-to must wait for the open phase");
  assert(!tokens.has("entered"), "Entered must wait for the idle phase");
});
