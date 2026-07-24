import { render } from "@solidjs/web";
import {
  type Component,
  createSignal,
  DEV,
  type Element,
  Errored,
  flush,
} from "solid-js";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import {
  Transition,
  TRANSITION_REF_ERROR,
  TransitionChild,
} from "../src/components/transition/transition.tsx";
import {
  OpenClosedState,
  useOpenClosed,
} from "../src/internal/transition-open-closed.tsx";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  host?.remove();
  dispose = undefined;
  host = undefined;
});

function mount(children: () => Element): void {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(children, host);
  flush();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const TransitionStyles = () => (
  <style>
    {`
    .transition-base { transition-property: opacity; transition-duration: 240ms; }
    .transition-fast { transition-property: opacity; transition-duration: 70ms; }
    .transition-slow { transition-property: opacity; transition-duration: 240ms; }
    .transition-from { opacity: 0; }
    .transition-to { opacity: 1; }
  `}
  </style>
);

test("appear runs an initial enter transition and lifecycle", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const events: string[] = [];

  mount(() => (
    <>
      <TransitionStyles />
      <Transition
        show
        appear
        data-testid="appear-panel"
        enter="transition-fast"
        enterFrom="transition-from"
        enterTo="transition-to"
        beforeEnter={() => events.push("beforeEnter")}
        afterEnter={() => events.push("afterEnter")}
      >
        Appearing
      </Transition>
    </>
  ));

  await expect.element(page.getByTestId("appear-panel"))
    .toHaveAttribute("data-enter", "");
  await expect.poll(() => events.join(","), { timeout: 2_000 })
    .toBe("beforeEnter,afterEnter");
  await expect.element(page.getByTestId("appear-panel"))
    .not.toHaveAttribute("data-transition");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("an interrupted enter reverses to leave without stale completion", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const events: string[] = [];

  function Example() {
    const [show, setShow] = createSignal(false);
    return (
      <>
        <TransitionStyles />
        <button type="button" onClick={() => setShow(true)}>Show</button>
        <button type="button" onClick={() => setShow(false)}>Hide</button>
        <Transition
          show={show()}
          data-testid="interrupt-panel"
          enter="transition-base"
          enterFrom="transition-from"
          enterTo="transition-to"
          leave="transition-base"
          leaveFrom="transition-to"
          leaveTo="transition-from"
          beforeEnter={() => events.push("beforeEnter")}
          afterEnter={() => events.push("afterEnter")}
          beforeLeave={() => events.push("beforeLeave")}
          afterLeave={() => events.push("afterLeave")}
        >
          Panel
        </Transition>
      </>
    );
  }

  mount(() => <Example />);
  await page.getByRole("button", { name: "Show" }).click();
  const panel = page.getByTestId("interrupt-panel");
  await expect.element(panel).toHaveAttribute("data-transition", "");
  await expect.element(panel).toHaveAttribute("data-enter", "");

  await delay(50);
  await page.getByRole("button", { name: "Hide" }).click();
  await expect.poll(() => events.includes("beforeLeave")).toBe(true);
  await expect.poll(
    () => document.querySelector("[data-testid=interrupt-panel]"),
    {
      timeout: 2_000,
    },
  ).toBeNull();

  expect(events).toEqual(["beforeEnter", "beforeLeave", "afterLeave"]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("an interrupted leave reverses to enter and keeps the element mounted", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const events: string[] = [];

  function Example() {
    const [show, setShow] = createSignal(true);
    return (
      <>
        <TransitionStyles />
        <button type="button" onClick={() => setShow(true)}>Show</button>
        <button type="button" onClick={() => setShow(false)}>Hide</button>
        <Transition
          show={show()}
          data-testid="reverse-panel"
          enter="transition-base"
          enterFrom="transition-from"
          enterTo="transition-to"
          leave="transition-base"
          leaveFrom="transition-to"
          leaveTo="transition-from"
          beforeEnter={() => events.push("beforeEnter")}
          afterEnter={() => events.push("afterEnter")}
          beforeLeave={() => events.push("beforeLeave")}
          afterLeave={() => events.push("afterLeave")}
        >
          Panel
        </Transition>
      </>
    );
  }

  mount(() => <Example />);
  await page.getByRole("button", { name: "Hide" }).click();
  const panel = page.getByTestId("reverse-panel");
  await expect.element(panel).toHaveAttribute("data-leave", "");
  await delay(50);
  await page.getByRole("button", { name: "Show" }).click();

  await expect.poll(() => events.includes("afterEnter"), { timeout: 2_000 })
    .toBe(true);
  await expect.element(page.getByTestId("reverse-panel"))
    .not.toHaveAttribute("data-transition");
  expect(events).toEqual(["beforeLeave", "beforeEnter", "afterEnter"]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("a transition boundary waits for its slowest nested child", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const events: string[] = [];

  function Example() {
    const [show, setShow] = createSignal(true);
    return (
      <>
        <TransitionStyles />
        <button type="button" onClick={() => setShow(false)}>
          Hide nested
        </button>
        <Transition
          show={show()}
          transition={false}
          data-testid="nested-root"
          beforeLeave={() => events.push("root:beforeLeave")}
          afterLeave={() => events.push("root:afterLeave")}
        >
          <TransitionChild
            data-testid="fast-child"
            leave="transition-fast"
            leaveFrom="transition-to"
            leaveTo="transition-from"
            beforeLeave={() => events.push("fast:beforeLeave")}
            afterLeave={() => events.push("fast:afterLeave")}
          >
            Fast
          </TransitionChild>
          <TransitionChild
            data-testid="slow-child"
            leave="transition-slow"
            leaveFrom="transition-to"
            leaveTo="transition-from"
            beforeLeave={() => events.push("slow:beforeLeave")}
            afterLeave={() => events.push("slow:afterLeave")}
          >
            Slow
          </TransitionChild>
        </Transition>
      </>
    );
  }

  mount(() => <Example />);
  // Let the inline test stylesheet participate in a rendered frame before
  // triggering the transition. Production stylesheets are already loaded.
  await delay(25);
  await page.getByRole("button", { name: "Hide nested" }).click();
  await delay(55);
  const slow = document.querySelector<HTMLElement>("[data-testid=slow-child]");
  expect({ exists: slow !== null, events }).toEqual({
    exists: true,
    events: [
      "root:beforeLeave",
      "fast:beforeLeave",
      "slow:beforeLeave",
    ],
  });
  expect(slow?.hasAttribute("data-leave")).toBe(true);
  expect(
    slow?.getAnimations().some((animation) =>
      animation.constructor.name === "CSSTransition" &&
      animation.playState === "running"
    ),
  ).toBe(true);

  await delay(100);
  expect(document.querySelector("[data-testid=nested-root]")).not.toBeNull();
  expect(document.querySelector("[data-testid=slow-child]")).not.toBeNull();

  await expect.poll(() => document.querySelector("[data-testid=nested-root]"), {
    timeout: 2_000,
  }).toBeNull();
  expect(events).toEqual([
    "root:beforeLeave",
    "fast:beforeLeave",
    "slow:beforeLeave",
    "fast:afterLeave",
    "slow:afterLeave",
    "root:afterLeave",
  ]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("the hidden render strategy retains DOM and exposes closing state", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setShow: ((show: boolean) => void) | undefined;

  function StateProbe() {
    const state = useOpenClosed();
    return <output id="open-closed-state">{state?.()}</output>;
  }

  function Example() {
    const [show, updateShow] = createSignal(true);
    setShow = updateShow;
    return (
      <>
        <TransitionStyles />
        <Transition
          show={show()}
          unmount={false}
          data-testid="retained-panel"
          leave="transition-fast"
          leaveFrom="transition-to"
          leaveTo="transition-from"
        >
          <StateProbe />
        </Transition>
      </>
    );
  }

  mount(() => <Example />);
  expect(document.getElementById("open-closed-state")?.textContent).toBe(
    String(OpenClosedState.Open),
  );

  setShow?.(false);
  flush();
  await expect.element(page.getByTestId("retained-panel"))
    .toHaveAttribute("data-leave", "");
  expect(document.getElementById("open-closed-state")?.textContent).toBe(
    String(OpenClosedState.Open | OpenClosedState.Closing),
  );

  await expect.poll(
    () =>
      document.querySelector<HTMLElement>("[data-testid=retained-panel]")
        ?.hidden,
    { timeout: 2_000 },
  ).toBe(true);
  const retained = document.querySelector<HTMLElement>(
    "[data-testid=retained-panel]",
  );
  expect(retained).not.toBeNull();
  expect(retained?.style.display).toBe("none");
  expect(document.getElementById("open-closed-state")?.textContent).toBe(
    String(OpenClosedState.Closed),
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("disposing a root cancels pending transition callbacks", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const events: string[] = [];
  let setShow: ((show: boolean) => void) | undefined;

  function Example() {
    const [show, updateShow] = createSignal(true);
    setShow = updateShow;
    return (
      <>
        <TransitionStyles />
        <Transition
          show={show()}
          data-testid="cleanup-panel"
          leave="transition-base"
          leaveFrom="transition-to"
          leaveTo="transition-from"
          beforeLeave={() => events.push("beforeLeave")}
          afterLeave={() => events.push("afterLeave")}
        >
          Cleanup
        </Transition>
      </>
    );
  }

  mount(() => <Example />);
  setShow?.(false);
  flush();
  await expect.element(page.getByTestId("cleanup-panel"))
    .toHaveAttribute("data-leave", "");
  dispose?.();
  dispose = undefined;
  await delay(350);

  expect(events).toEqual(["beforeLeave"]);
  expect(document.querySelector("[data-testid=cleanup-panel]")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("active transitions reject transparent components with migration guidance", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const Transparent: Component<{ children?: Element }> = (props) => (
    <>{props.children}</>
  );

  mount(() => (
    <Errored
      fallback={(error) => (
        <output aria-label="transition error">
          {(error() as Error).message}
        </output>
      )}
    >
      <Transition show as={Transparent} enter="transition-base">
        <span>Unsupported</span>
      </Transition>
    </Errored>
  ));

  await expect.element(page.getByLabelText("transition error"))
    .toHaveTextContent(TRANSITION_REF_ERROR);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
