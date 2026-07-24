import { batch, Machine, shallowEqual } from "../../src/machine.ts";
import { stackMachines } from "../../src/machines/stack-machine.ts";
import {
  calculateActiveIndex,
  Focus,
} from "../../src/utils/calculate-active-index.ts";
import { classNames } from "../../src/utils/class-names.ts";
import { DefaultMap } from "../../src/utils/default-map.ts";
import { disposables } from "../../src/utils/disposables.ts";
import { env } from "../../src/utils/env.ts";
import { match } from "../../src/utils/match.ts";
import { microTask } from "../../src/utils/micro-task.ts";
import { once } from "../../src/utils/once.ts";

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

function throws(callback: () => unknown, expected: RegExp): void {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error && expected.test(error.message)) return;
    throw error;
  }

  throw new Error(`Expected callback to throw ${expected}`);
}

function assertMatch(actual: string, expected: RegExp): void {
  if (!expected.test(actual)) {
    throw new Error(`Expected ${JSON.stringify(actual)} to match ${expected}`);
  }
}

Deno.test("calculateActiveIndex preserves upstream focus semantics", () => {
  const items = [
    { disabled: false, id: "a" },
    { disabled: true, id: "b" },
    { disabled: false, id: "c" },
  ];
  const calculate = (
    action:
      | { focus: Focus.Specific; id: string }
      | { focus: Exclude<Focus, Focus.Specific> },
    active: number | null,
  ) =>
    calculateActiveIndex(action, {
      resolveActiveIndex: () => active,
      resolveDisabled: (item) => item.disabled,
      resolveId: (item) => item.id,
      resolveItems: () => items,
    });

  strictEqual(calculate({ focus: Focus.First }, null), 0);
  strictEqual(calculate({ focus: Focus.Previous }, null), 2);
  strictEqual(calculate({ focus: Focus.Previous }, 2), 0);
  strictEqual(calculate({ focus: Focus.Next }, 0), 2);
  strictEqual(calculate({ focus: Focus.Next }, 2), 2);
  strictEqual(calculate({ focus: Focus.Last }, null), 2);
  strictEqual(calculate({ focus: Focus.Specific, id: "b" }, 0), 1);
  strictEqual(calculate({ focus: Focus.Specific, id: "missing" }, 2), 2);
  strictEqual(calculate({ focus: Focus.Nothing }, 2), null);

  strictEqual(
    calculateActiveIndex(
      { focus: Focus.First },
      {
        resolveActiveIndex: () => null,
        resolveDisabled: () => false,
        resolveId: () => "",
        resolveItems: () => [],
      },
    ),
    null,
  );
});

Deno.test("DefaultMap creates missing values once and treats undefined as missing", () => {
  let calls = 0;
  const map = new DefaultMap<string, number | undefined>(() => ++calls);

  strictEqual(map.get("a"), 1);
  strictEqual(map.get("a"), 1);
  strictEqual(calls, 1);

  map.set("a", undefined);
  strictEqual(map.get("a"), 2);
  strictEqual(calls, 2);
});

Deno.test("classNames flattens, filters, and de-duplicates tokens", () => {
  strictEqual(
    classNames("button primary", false, "primary  active", null, undefined),
    "button primary active",
  );
});

Deno.test("match handles values, handlers, and missing cases", () => {
  strictEqual(match("idle", { idle: 7 }), 7);
  strictEqual(
    match("sum", { sum: (left: number, right: number) => left + right }, 2, 3),
    5,
  );
  throws(
    () => match("missing", { ready: true } as Record<string, boolean>),
    /Tried to handle "missing".*"ready"/,
  );
});

Deno.test("once and microTask preserve call ordering", async () => {
  const values: number[] = [];
  const callback = once((value: number) => values.push(value));

  callback(1);
  callback(2);
  deepStrictEqual(values, [1]);

  microTask(() => values.push(3));
  deepStrictEqual(values, [1]);
  await Promise.resolve();
  deepStrictEqual(values, [1, 3]);
});

Deno.test("disposables de-duplicate cleanup and cancel queued microtasks", async () => {
  const values: string[] = [];
  const d = disposables();
  const cleanup = () => values.push("cleanup");

  d.add(cleanup);
  d.add(cleanup);
  d.microTask(() => values.push("microtask"));
  d.dispose();
  await Promise.resolve();

  deepStrictEqual(values, ["cleanup"]);
});

Deno.test("shallowEqual and batch retain machine helper behavior", async () => {
  strictEqual(shallowEqual(1, 1), true);
  strictEqual(shallowEqual(1, "1"), false);
  strictEqual(shallowEqual([1, "two"], [1, "two"]), true);
  strictEqual(shallowEqual([1], [1, 2]), false);
  strictEqual(shallowEqual(new Date(0), new Date(0)), false);

  const values: Array<string | number> = [];
  const batched = batch<(value: number) => void>(() => [
    (value) => values.push(value),
    () => values.push("handled"),
  ]);
  batched(1);
  batched(2);
  deepStrictEqual(values, [1, 2]);
  await Promise.resolve();
  deepStrictEqual(values, [1, 2, "handled"]);
});

type CounterState = { count: number; label: string };
type CounterEvent =
  | { type: "increment"; by: number }
  | { type: "rename"; label: string }
  | { type: "noop" };

class CounterMachine extends Machine<CounterState, CounterEvent> {
  reduce(state: Readonly<CounterState>, event: CounterEvent): CounterState {
    switch (event.type) {
      case "increment":
        return { ...state, count: state.count + event.by };
      case "rename":
        return { ...state, label: event.label };
      case "noop":
        return state;
    }
  }
}

Deno.test("Machine notifies selected state and typed event subscribers", () => {
  const previousEnv = env.current;
  env.set("client");

  try {
    const machine = new CounterMachine({ count: 0, label: "zero" });
    const selected: number[][] = [];
    const increments: number[] = [];
    const unsubscribe = machine.subscribe(
      (state) => [state.count],
      (value) => selected.push(value),
    );
    machine.on("increment", (_state, event) => increments.push(event.by));

    machine.send({ type: "rename", label: "same count" });
    machine.send({ type: "increment", by: 2 });
    machine.send({ type: "noop" });
    deepStrictEqual(selected, [[2]]);
    deepStrictEqual(increments, [2]);

    unsubscribe();
    machine.send({ type: "increment", by: 1 });
    deepStrictEqual(selected, [[2]]);
    strictEqual(machine.state.count, 3);
  } finally {
    env.set(previousEnv);
  }
});

Deno.test("stack machine pushes, reorders, pops, and isolates scopes", () => {
  const scope = `pure-utils-${crypto.randomUUID()}`;
  const otherScope = `${scope}-other`;
  const machine = stackMachines.get(scope);

  machine.actions.push("dialog");
  machine.actions.push("menu");
  deepStrictEqual(machine.state.stack, ["dialog", "menu"]);
  strictEqual(machine.selectors.isTop(machine.state, "menu"), true);
  strictEqual(machine.selectors.inStack(machine.state, "dialog"), true);

  machine.actions.push("dialog");
  deepStrictEqual(machine.state.stack, ["menu", "dialog"]);
  const alreadyTopState = machine.state;
  machine.actions.push("dialog");
  strictEqual(machine.state, alreadyTopState);
  machine.actions.pop("menu");
  deepStrictEqual(machine.state.stack, ["dialog"]);
  machine.actions.pop("missing");
  deepStrictEqual(machine.state.stack, ["dialog"]);
  deepStrictEqual(stackMachines.get(otherScope).state.stack, []);

  assertMatch(scope, /^pure-utils-/);
});
