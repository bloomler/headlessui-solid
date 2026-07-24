import { render } from "@solidjs/web";
import {
  createContext,
  createSignal,
  DEV,
  type Element,
  flush,
  type Setter,
  Show,
} from "solid-js";
import { afterEach, expect, test } from "vitest";
import type { AnyProps } from "../src/utils/merge-event-props.ts";
import { renderElement } from "../src/utils/render.tsx";

interface KernelSlot {
  label: string;
}

function Kernel(props: {
  children?: Element | ((slot: KernelSlot) => Element);
  id: string;
}): Element {
  const slot: KernelSlot = { label: "slot-value" };

  return renderElement({
    defaultTag: "section",
    name: "TestKernel",
    ourProps: { id: props.id },
    slot,
    theirProps: props as AnyProps,
  });
}

const ProjectionContext = createContext("default");

function Projection(props: { children?: Element }): Element {
  return (
    <ProjectionContext value="projected">
      {props.children}
    </ProjectionContext>
  );
}

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

function mount(view: () => Element): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(view, host);
  flush();
  return host;
}

afterEach(() => {
  dispose?.();
  host?.remove();
  dispose = undefined;
  host = undefined;
  document.body.replaceChildren();
});

test("preserves zero-arity Solid child accessors and invokes one-argument slot callbacks", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const accessorArgumentCounts: number[] = [];
  let setValue!: Setter<string>;
  let receivedSlot: KernelSlot | undefined;

  function Example() {
    const [value, updateValue] = createSignal("first");
    setValue = updateValue;

    function accessorChild() {
      accessorArgumentCounts.push(arguments.length);
      return <span id="accessor-child">{value()}</span>;
    }

    return (
      <>
        <Kernel id="accessor-kernel">{accessorChild}</Kernel>
        <Kernel id="slot-kernel">
          {(slot) => {
            receivedSlot = slot;
            return <span id="slot-child">{slot.label}</span>;
          }}
        </Kernel>
      </>
    );
  }

  const root = mount(() => <Example />);
  expect(root.querySelector("#accessor-child")?.textContent).toBe("first");
  expect(accessorArgumentCounts).toEqual([0]);
  expect(receivedSlot).toEqual({ label: "slot-value" });
  expect(root.querySelector("#slot-child")?.textContent).toBe("slot-value");

  setValue("second");
  flush();
  await Promise.resolve();

  expect(root.querySelector("#accessor-child")?.textContent).toBe("second");
  // The child component stays mounted; its compiled text binding handles the
  // signal update without asking the render kernel to project it again.
  expect(accessorArgumentCounts).toEqual([0]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("does not reconstruct a projected stateful child after an internal update", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setExpanded!: Setter<boolean>;
  let instances = 0;

  function StatefulChild() {
    instances += 1;
    const [expanded, updateExpanded] = createSignal(false);
    setExpanded = updateExpanded;

    return (
      <div id="stateful-child">
        <Show when={expanded()}>
          <span id="expanded-content">Expanded</span>
        </Show>
      </div>
    );
  }

  function Example() {
    const projected = (
      <Projection>
        <StatefulChild />
      </Projection>
    );

    return <Kernel id="projection-kernel">{projected}</Kernel>;
  }

  const root = mount(() => <Example />);
  expect(instances).toBe(1);
  expect(root.querySelector("#expanded-content")).toBeNull();

  setExpanded(true);
  flush();
  await Promise.resolve();

  expect(root.querySelector("#expanded-content")?.textContent).toBe(
    "Expanded",
  );
  expect(instances).toBe(1);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
