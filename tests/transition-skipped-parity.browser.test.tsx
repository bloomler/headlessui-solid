import { render } from "@solidjs/web";
import {
  createSignal,
  DEV,
  type Element as SolidElement,
  flush,
} from "solid-js";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import {
  Transition,
  TransitionChild,
} from "../src/components/transition/transition.tsx";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

function mount(view: () => SolidElement): void {
  host = document.createElement("div");
  host.id = "transition-skipped-parity-host";
  document.body.append(host);
  dispose = render(view, host);
  flush();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
  for (let frame = 0; frame < 2; frame++) {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
    flush();
  }
}

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  await settle();
  host?.remove();
  host = undefined;
  document.body.replaceChildren();
});

test("upstream skipped millisecond enter/leave timeline completes every lifecycle stage", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const events: string[] = [];

  function Example() {
    const [show, setShow] = createSignal(false);
    return (
      <>
        <style>
          {`
            .skipped-ms-enter {
              transition-property: opacity;
              transition-duration: 70ms;
            }
            .skipped-ms-leave {
              transition-property: opacity;
              transition-duration: 90ms;
            }
            .skipped-from { opacity: 0; }
            .skipped-to { opacity: 1; }
          `}
        </style>
        <button type="button" onClick={() => setShow(true)}>
          Show timeline
        </button>
        <button type="button" onClick={() => setShow(false)}>
          Hide timeline
        </button>
        <Transition
          show={show()}
          data-testid="skipped-ms-panel"
          enter="skipped-ms-enter"
          enterFrom="skipped-from"
          enterTo="skipped-to"
          leave="skipped-ms-leave"
          leaveFrom="skipped-to"
          leaveTo="skipped-from"
          beforeEnter={() => events.push("beforeEnter")}
          afterEnter={() => events.push("afterEnter")}
          beforeLeave={() => events.push("beforeLeave")}
          afterLeave={() => events.push("afterLeave")}
        >
          Timeline panel
        </Transition>
      </>
    );
  }

  mount(() => <Example />);
  await settle();
  events.length = 0;

  await page.getByRole("button", { name: "Show timeline" }).click();
  await expect.element(page.getByTestId("skipped-ms-panel"))
    .toHaveAttribute("data-enter", "");
  await expect.poll(() => events.join(","), { timeout: 2_000 })
    .toBe("beforeEnter,afterEnter");
  await expect.element(page.getByTestId("skipped-ms-panel"))
    .not.toHaveAttribute("data-transition");

  await page.getByRole("button", { name: "Hide timeline" }).click();
  await expect.element(page.getByTestId("skipped-ms-panel"))
    .toHaveAttribute("data-leave", "");
  await expect.poll(
    () => document.querySelector("[data-testid=skipped-ms-panel]"),
    { timeout: 2_000 },
  ).toBeNull();
  expect(events).toEqual([
    "beforeEnter",
    "afterEnter",
    "beforeLeave",
    "afterLeave",
  ]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("upstream skipped seconds timeline round-trips with the hidden render strategy", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setShow: ((value: boolean) => void) | undefined;
  let afterEnter = 0;
  let afterLeave = 0;

  function Example() {
    const [show, updateShow] = createSignal(false);
    setShow = updateShow;
    return (
      <>
        <style>
          {`
            .skipped-seconds-enter,
            .skipped-seconds-leave {
              transition-property: opacity;
              transition-duration: 0.08s;
            }
            .skipped-seconds-from { opacity: 0; }
            .skipped-seconds-to { opacity: 1; }
          `}
        </style>
        <Transition
          show={show()}
          unmount={false}
          data-testid="skipped-seconds-panel"
          enter="skipped-seconds-enter"
          enterFrom="skipped-seconds-from"
          enterTo="skipped-seconds-to"
          leave="skipped-seconds-leave"
          leaveFrom="skipped-seconds-to"
          leaveTo="skipped-seconds-from"
          afterEnter={() => afterEnter += 1}
          afterLeave={() => afterLeave += 1}
        >
          Retained timeline
        </Transition>
      </>
    );
  }

  mount(() => <Example />);
  await settle();
  const panel = page.getByTestId("skipped-seconds-panel");
  await expect.element(panel).toHaveAttribute("hidden");
  const initialAfterLeave = afterLeave;

  setShow?.(true);
  flush();
  await expect.element(panel).toHaveAttribute("data-enter", "");
  await expect.poll(() => afterEnter, { timeout: 2_000 }).toBe(1);
  await expect.element(panel).not.toHaveAttribute("hidden");

  setShow?.(false);
  flush();
  await expect.element(panel).toHaveAttribute("data-leave", "");
  await expect.poll(() => afterLeave, { timeout: 2_000 })
    .toBe(initialAfterLeave + 1);
  await expect.element(panel).toHaveAttribute("hidden");
  expect(panel.element().style.display).toBe("none");

  setShow?.(true);
  flush();
  await expect.poll(() => afterEnter, { timeout: 2_000 }).toBe(2);
  await expect.element(panel).not.toHaveAttribute("hidden");
  expect(panel.element().style.display).toBe("");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("an independent nested Transition does not extend its parent child timeline", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const events: string[] = [];

  function Example() {
    const [show, setShow] = createSignal(true);
    return (
      <>
        <style>
          {`
            .isolated-fast,
            .isolated-slow,
            .isolated-independent {
              transition-property: opacity;
            }
            .isolated-fast { transition-duration: 60ms; }
            .isolated-slow { transition-duration: 180ms; }
            .isolated-independent { transition-duration: 0.5s; }
            .isolated-from { opacity: 1; }
            .isolated-to { opacity: 0; }
          `}
        </style>
        <button type="button" onClick={() => setShow(false)}>
          Hide isolated tree
        </button>
        <Transition
          show={show()}
          transition={false}
          data-testid="isolated-root"
          afterLeave={() => events.push("root:afterLeave")}
        >
          <TransitionChild
            leave="isolated-fast"
            leaveFrom="isolated-from"
            leaveTo="isolated-to"
            afterLeave={() => events.push("fast:afterLeave")}
          >
            Fast child
            <Transition
              show={show()}
              leave="isolated-independent"
              leaveFrom="isolated-from"
              leaveTo="isolated-to"
              afterLeave={() => events.push("independent:afterLeave")}
            >
              Independent root
            </Transition>
          </TransitionChild>
          <TransitionChild
            leave="isolated-slow"
            leaveFrom="isolated-from"
            leaveTo="isolated-to"
            afterLeave={() => events.push("slow:afterLeave")}
          >
            Slow child
          </TransitionChild>
        </Transition>
      </>
    );
  }

  mount(() => <Example />);
  await settle();
  await delay(25);
  await page.getByRole("button", { name: "Hide isolated tree" }).click();
  await delay(100);
  expect(document.querySelector("[data-testid=isolated-root]")).not.toBeNull();

  await expect.poll(
    () => document.querySelector("[data-testid=isolated-root]"),
    { timeout: 2_000 },
  ).toBeNull();
  expect(events).toContain("fast:afterLeave");
  expect(events).toContain("slow:afterLeave");
  expect(events.at(-1)).toBe("root:afterLeave");
  // The 500ms independent root is disposed with the 60ms child and never
  // participates in the parent's 180ms nesting timeline.
  expect(events).not.toContain("independent:afterLeave");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
