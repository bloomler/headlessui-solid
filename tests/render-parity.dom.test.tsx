import { type JSX, render, type ValidComponent } from "@solidjs/web";
import {
  createSignal,
  DEV,
  type Element as SolidElement,
  flush,
  type Setter,
} from "solid-js";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { AnyProps } from "../src/utils/merge-event-props.ts";
import { renderElement, RenderFeatures } from "../src/utils/render.tsx";

interface RenderSlot {
  active: boolean;
  disabled: boolean;
  label: string;
}

const defaultSlot: RenderSlot = {
  active: true,
  disabled: false,
  label: "slot-label",
};

function fixture(options: {
  defaultTag?: ValidComponent;
  features?: RenderFeatures;
  ourProps?: AnyProps;
  slot?: RenderSlot;
  stateKeys?: readonly (keyof RenderSlot & string)[];
  theirProps?: AnyProps;
  visible?: boolean | (() => boolean);
} = {}): SolidElement {
  return renderElement({
    defaultTag: options.defaultTag ?? "div",
    features: options.features,
    name: "RenderParityFixture",
    ourProps: options.ourProps ?? {},
    slot: options.slot ?? defaultSlot,
    stateKeys: options.stateKeys,
    theirProps: options.theirProps ?? {},
    visible: options.visible,
  });
}

function Transparent(props: { children?: SolidElement }): SolidElement {
  return <>{props.children}</>;
}

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;
let stopDiagnostics: (() => unknown[]) | undefined;

function mount(view: () => SolidElement): HTMLDivElement {
  host = document.createElement("div");
  host.id = "render-parity-host";
  document.body.append(host);
  dispose = render(view, host);
  flush();
  return host;
}

beforeEach(() => {
  const diagnostics = DEV?.diagnostics.capture();
  stopDiagnostics = diagnostics ? () => diagnostics.stop() : undefined;
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  host?.remove();
  host = undefined;
  document.body.replaceChildren();
  expect(stopDiagnostics?.() ?? []).toEqual([]);
  stopDiagnostics = undefined;
});

test("renders a dummy component with its default element", () => {
  const root = mount(() =>
    fixture({ theirProps: { id: "default-dummy", children: "Contents" } })
  );
  const element = root.querySelector<HTMLElement>("#default-dummy")!;
  expect(element.tagName).toBe("DIV");
  expect(element.textContent).toBe("Contents");
});

test("upstream Fragment class merging adapts to a concrete Solid class target", () => {
  const root = mount(() =>
    fixture({
      theirProps: {
        as: "section",
        class: "consumer-class",
        id: "class-value-target",
      },
    })
  );
  expect(root.querySelector("#class-value-target")?.getAttribute("class"))
    .toBe("consumer-class");
});

test("a Solid class callback receives the render slot", () => {
  let received: RenderSlot | undefined;
  const root = mount(() =>
    fixture({
      theirProps: {
        class: (slot: RenderSlot) => {
          received = slot;
          return slot.active ? "active-class" : "inactive-class";
        },
        id: "class-callback-target",
      },
    })
  );
  expect(received).toBe(defaultSlot);
  expect(root.querySelector("#class-callback-target")?.getAttribute("class"))
    .toBe("active-class");
});

test("a child render callback receives the exact slot", () => {
  let received: RenderSlot | undefined;
  const root = mount(() =>
    fixture({
      theirProps: {
        id: "child-callback-target",
        children: (slot: RenderSlot) => {
          received = slot;
          return <span id="child-callback-output">{slot.label}</span>;
        },
      },
    })
  );
  expect(received).toBe(defaultSlot);
  expect(root.querySelector("#child-callback-output")?.textContent).toBe(
    "slot-label",
  );
});

test("a custom Solid component accepts an explicitly named ref prop", () => {
  let referenced: HTMLDivElement | undefined;

  function NamedRefTarget(props: {
    children?: SolidElement;
    id?: string;
    innerRef?: JSX.Ref<HTMLDivElement>;
  }): SolidElement {
    return (
      <div id={props.id} ref={props.innerRef}>
        {props.children}
      </div>
    );
  }

  const root = mount(() =>
    fixture({
      ourProps: {
        innerRef: (element: HTMLDivElement) => referenced = element,
      },
      theirProps: {
        as: NamedRefTarget,
        children: "Named ref",
        id: "named-ref-target",
      },
    })
  );
  expect(referenced).toBe(root.querySelector("#named-ref-target"));
  expect(referenced?.textContent).toBe("Named ref");
});

test("passes arbitrary consumer props to the rendered element", () => {
  const root = mount(() =>
    fixture({
      theirProps: {
        "data-a": "1",
        "data-b": "2",
        "data-c": "3",
        id: "passthrough-target",
      },
    })
  );
  const element = root.querySelector("#passthrough-target")!;
  expect([
    element.getAttribute("data-a"),
    element.getAttribute("data-b"),
    element.getAttribute("data-c"),
  ]).toEqual(["1", "2", "3"]);
});

test("the as prop changes the underlying DOM node", () => {
  const root = mount(() =>
    fixture({ theirProps: { as: "button", id: "as-button" } })
  );
  expect(root.querySelector("#as-button")?.tagName).toBe("BUTTON");
});

test("the as prop composes with a child render callback", () => {
  const root = mount(() =>
    fixture({
      theirProps: {
        as: "button",
        children: (slot: RenderSlot) => <span>{slot.label}</span>,
        id: "as-callback-button",
      },
    })
  );
  const button = root.querySelector("#as-callback-button")!;
  expect(button.tagName).toBe("BUTTON");
  expect(button.textContent).toBe("slot-label");
});

test("a transparent Solid component intentionally renders only its children", () => {
  const root = mount(() =>
    fixture({
      theirProps: { as: Transparent, children: "Transparent contents" },
    })
  );
  expect(root.textContent).toBe("Transparent contents");
  expect(root.children).toHaveLength(0);
});

test("upstream Fragment first-child prop forwarding adapts to an explicit component target", () => {
  function SpanTarget(
    props: JSX.HTMLAttributes<HTMLSpanElement>,
  ): SolidElement {
    return <span {...props} />;
  }

  const root = mount(() =>
    fixture({
      theirProps: {
        as: SpanTarget,
        children: "Explicit target",
        "data-a": "1",
        "data-b": "2",
        id: "explicit-forward-target",
      },
    })
  );
  const target = root.querySelector("#explicit-forward-target")!;
  expect(target.tagName).toBe("SPAN");
  expect(target.getAttribute("data-a")).toBe("1");
  expect(target.getAttribute("data-b")).toBe("2");
});

test("boolean slot values become explicit state data attributes", () => {
  const root = mount(() =>
    fixture({
      stateKeys: ["active", "disabled"],
      theirProps: { id: "slot-state-target" },
    })
  );
  const target = root.querySelector("#slot-state-target")!;
  expect(target.getAttribute("data-headlessui-state")).toBe("active");
  expect(target.getAttribute("data-active")).toBe("");
  expect(target.hasAttribute("data-disabled")).toBe(false);
});

test("consumer state data attributes override generated defaults", () => {
  const root = mount(() =>
    fixture({
      stateKeys: ["active"],
      theirProps: {
        "data-active": "consumer-value",
        "data-headlessui-state": "consumer-state",
        id: "consumer-state-target",
      },
    })
  );
  const target = root.querySelector("#consumer-state-target")!;
  expect(target.getAttribute("data-active")).toBe("consumer-value");
  expect(target.getAttribute("data-headlessui-state")).toBe("consumer-state");
});

test("upstream Fragment multi-child prop errors adapt to a concrete Solid wrapper", () => {
  const root = mount(() =>
    fixture({
      theirProps: {
        as: "section",
        children: (
          <>
            <span>Contents A</span>
            <span>Contents B</span>
          </>
        ),
        class: "p-12",
        id: "multi-child-wrapper",
      },
    })
  );
  const wrapper = root.querySelector("#multi-child-wrapper")!;
  expect(wrapper.getAttribute("class")).toBe("p-12");
  expect(wrapper.children).toHaveLength(2);
});

test("a transparent Solid target accepts multiple children when no props need forwarding", () => {
  const root = mount(() =>
    fixture({
      theirProps: {
        as: Transparent,
        children: (
          <>
            <span>Contents A</span>
            <span>Contents B</span>
          </>
        ),
      },
    })
  );
  expect([...root.querySelectorAll("span")].map((node) => node.textContent))
    .toEqual(["Contents A", "Contents B"]);
});

test("upstream Fragment text prop errors adapt to a concrete Solid wrapper", () => {
  const root = mount(() =>
    fixture({
      theirProps: {
        as: "div",
        children: "Contents",
        class: "p-12",
        id: "text-wrapper",
      },
    })
  );
  const wrapper = root.querySelector("#text-wrapper")!;
  expect(wrapper.getAttribute("class")).toBe("p-12");
  expect(wrapper.textContent).toBe("Contents");
});

interface FeatureCase {
  features: RenderFeatures;
  name: string;
  rendered: boolean;
  static?: boolean;
  unmount?: boolean;
  visible: boolean;
  hidden: boolean;
}

test.each<FeatureCase>([
  {
    features: RenderFeatures.Static,
    hidden: false,
    name: "static dummy (show = true)",
    rendered: true,
    static: true,
    visible: true,
  },
  {
    features: RenderFeatures.Static,
    hidden: false,
    name: "static dummy (show = false)",
    rendered: true,
    static: true,
    visible: false,
  },
  {
    features: RenderFeatures.RenderStrategy,
    hidden: false,
    name: "unmount dummy (show = true)",
    rendered: true,
    unmount: true,
    visible: true,
  },
  {
    features: RenderFeatures.RenderStrategy,
    hidden: false,
    name: "unmount dummy (show = false)",
    rendered: false,
    unmount: true,
    visible: false,
  },
  {
    features: RenderFeatures.RenderStrategy,
    hidden: false,
    name: "unmount=false dummy (show = true)",
    rendered: true,
    unmount: false,
    visible: true,
  },
  {
    features: RenderFeatures.RenderStrategy,
    hidden: true,
    name: "unmount=false dummy (show = false)",
    rendered: true,
    unmount: false,
    visible: false,
  },
])(
  "renders $name",
  ({ features, hidden, rendered, static: isStatic, unmount, visible }) => {
    const root = mount(() =>
      fixture({
        features,
        theirProps: {
          children: "Feature contents",
          id: "feature-target",
          static: isStatic,
          unmount,
        },
        visible,
      })
    );
    const target = root.querySelector<HTMLElement>("#feature-target");
    expect(target !== null).toBe(rendered);
    if (!target) return;
    expect(target.hidden).toBe(hidden);
    expect(target.style.display).toBe(hidden ? "none" : "");
  },
);

test("render strategy visibility and class callbacks stay reactive", async () => {
  let setVisible!: Setter<boolean>;
  let setActive!: Setter<boolean>;

  function Example(): SolidElement {
    const [visible, updateVisible] = createSignal(false);
    const [active, updateActive] = createSignal(false);
    setVisible = updateVisible;
    setActive = updateActive;
    const slot = {
      get active() {
        return active();
      },
      disabled: false,
      label: "reactive-slot",
    };
    return fixture({
      features: RenderFeatures.RenderStrategy,
      slot,
      stateKeys: ["active"],
      theirProps: {
        class: (current: RenderSlot) => current.active ? "active" : "idle",
        id: "reactive-render-target",
        unmount: false,
      },
      visible,
    });
  }

  const root = mount(() => <Example />);
  const target = root.querySelector<HTMLElement>("#reactive-render-target")!;
  expect(target.hidden).toBe(true);
  expect(target.getAttribute("class")).toBe("idle");
  expect(target.hasAttribute("data-active")).toBe(false);

  setVisible(true);
  setActive(true);
  flush();
  await Promise.resolve();
  expect(target.hidden).toBe(false);
  expect(target.getAttribute("class")).toBe("active");
  expect(target.getAttribute("data-active")).toBe("");
});
