import { render } from "@solidjs/web";
import { createSignal, DEV, type Element, flush } from "solid-js";
import { afterEach, expect, test } from "vitest";
import {
  Transition,
  TransitionChild,
} from "../src/components/transition/transition.tsx";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

async function settle(): Promise<void> {
  flush();
  // Even with transition={false}, a nested root waits for each child to
  // publish and settle its parent registration before the root can hide.
  // Drain that deterministic microtask chain without introducing timers.
  for (let turn = 0; turn < 10; turn++) {
    await Promise.resolve();
    flush();
  }
}

function mount(view: () => Element): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(view, host);
  flush();
  return host;
}

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  await settle();
  host?.remove();
  host = undefined;
  document.body.replaceChildren();
});

test("Transition preserves concrete refs, consumer props, and render slots", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let reference: HTMLElement | undefined;
  let slotElement: HTMLElement | null = null;

  const root = mount(() => (
    <Transition
      show
      transition={false}
      as="section"
      id="setup-transition"
      data-purpose="passthrough"
      ref={(element) => reference = element}
      class={(slot) => {
        slotElement = slot.element;
        return { bound: slot.element !== null };
      }}
    >
      {(slot) => <span>{slot.element ? "Bound" : "Pending"}</span>}
    </Transition>
  ));
  await settle();

  const transition = root.querySelector<HTMLElement>("#setup-transition")!;
  expect(transition.tagName).toBe("SECTION");
  expect(transition.dataset.purpose).toBe("passthrough");
  expect(reference).toBe(transition);
  expect(slotElement).toBe(transition);
  expect(transition.classList.contains("bound")).toBe(true);
  expect(transition.textContent).toBe("Bound");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Transition statics nest, switch render strategies, and keep child refs", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setShow!: (value: boolean) => boolean;
  let childElement: HTMLElement | undefined;

  function Example() {
    const [show, updateShow] = createSignal(true);
    setShow = updateShow;
    return (
      <>
        <Transition.Root
          show={show()}
          transition={false}
          as="main"
          id="nested-root"
        >
          <Transition.Child
            transition={false}
            as="article"
            id="static-child"
            ref={(element) => childElement = element}
          >
            Static child
          </Transition.Child>
          <TransitionChild transition={false} as="aside" id="named-child">
            Named child
          </TransitionChild>
        </Transition.Root>
        <Transition
          show={show()}
          transition={false}
          unmount={false}
          id="retained-transition"
        >
          Retained
        </Transition>
      </>
    );
  }

  const root = mount(() => <Example />);
  await settle();
  expect(root.querySelector("#nested-root")?.tagName).toBe("MAIN");
  expect(childElement?.tagName).toBe("ARTICLE");
  expect(root.querySelector("#named-child")?.tagName).toBe("ASIDE");

  setShow(false);
  await settle();
  expect(root.querySelector("#nested-root")).toBeNull();
  const retained = root.querySelector<HTMLElement>("#retained-transition")!;
  expect(retained.hidden).toBe(true);
  expect(retained.style.display).toBe("none");

  setShow(true);
  await settle();
  expect(root.querySelector("#nested-root")).not.toBeNull();
  expect(retained.hidden).toBe(false);
  expect(retained.style.display).toBe("");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
