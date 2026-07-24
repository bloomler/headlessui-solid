import { render } from "@solidjs/web";
import {
  createSignal,
  DEV,
  type Element,
  flush,
  Loading,
  type Setter,
} from "solid-js";
import { afterEach, expect, test } from "vitest";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "../src/components/disclosure/disclosure.tsx";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  host?.remove();
  dispose = undefined;
  host = undefined;
});

function mount(view: () => Element): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(view, host);
  flush();
  return host;
}

function key(
  target: HTMLElement,
  value: string,
  type = "keydown",
): KeyboardEvent {
  const event = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    key: value,
  });
  target.dispatchEvent(event);
  flush();
  return event;
}

test("Disclosure samples defaultOpen once and reacts to native button events", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setInitial!: Setter<boolean>;
  let consumerClicks = 0;
  let consumerButton = -1;

  function Example() {
    const [initial, updateInitial] = createSignal(false);
    setInitial = updateInitial;

    return (
      <Disclosure defaultOpen={initial()}>
        {(slot) => (
          <>
            <output id="root-state">{slot.open ? "open" : "closed"}</output>
            <DisclosureButton
              id="trigger"
              onClick={(event) => {
                consumerClicks++;
                consumerButton = event.button;
              }}
            >
              {(button) => button.open ? "Hide" : "Show"}
            </DisclosureButton>
            <DisclosurePanel id="panel">Contents</DisclosurePanel>
          </>
        )}
      </Disclosure>
    );
  }

  const root = mount(() => <Example />);
  const trigger = root.querySelector<HTMLButtonElement>("#trigger")!;

  expect(trigger.type).toBe("button");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(trigger.getAttribute("aria-controls")).toBeNull();
  expect(trigger.textContent).toBe("Show");
  expect(root.querySelector("#panel")).toBeNull();

  setInitial(true);
  flush();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(root.querySelector("#panel")).toBeNull();

  trigger.click();
  flush();
  await Promise.resolve();
  flush();
  expect(consumerClicks).toBe(1);
  expect(consumerButton).toBe(0);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(trigger.getAttribute("aria-controls")).toBe("panel");
  expect(trigger.textContent).toBe("Hide");
  expect(root.querySelector("#panel")?.textContent).toBe("Contents");
  expect(root.querySelector("#root-state")?.textContent).toBe("open");
  expect(trigger.getAttribute("data-open")).toBe("");

  const enter = key(trigger, "Enter");
  expect(enter.defaultPrevented).toBe(true);
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(trigger.getAttribute("aria-controls")).toBeNull();
  expect(root.querySelector("#panel")).toBeNull();

  const spaceDown = key(trigger, " ");
  const spaceUp = key(trigger, " ", "keyup");
  expect(spaceDown.defaultPrevented).toBe(true);
  expect(spaceUp.defaultPrevented).toBe(true);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(root.querySelector("#panel")).not.toBeNull();

  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("nested DisclosureButton closes its own panel and restores focus", () => {
  const diagnostics = DEV?.diagnostics.capture();
  let rootElement: HTMLElement | undefined;
  let triggerElement: HTMLElement | undefined;
  let panelElement: HTMLElement | undefined;

  const root = mount(() => (
    <Disclosure
      as="section"
      defaultOpen
      ref={(element) => rootElement = element}
    >
      <DisclosureButton
        id="primary"
        ref={(element) => triggerElement = element}
      >
        Open
      </DisclosureButton>
      <DisclosurePanel
        id="nested-panel"
        ref={(element) => panelElement = element}
      >
        <DisclosureButton id="ignored-close-id">Close</DisclosureButton>
      </DisclosurePanel>
    </Disclosure>
  ));

  const primary = root.querySelector<HTMLButtonElement>("#primary")!;
  const close = Array.from(root.querySelectorAll("button")).find((element) =>
    element.textContent === "Close"
  )!;

  expect(rootElement?.tagName).toBe("SECTION");
  expect(triggerElement).toBe(primary);
  expect(panelElement?.id).toBe("nested-panel");
  expect(close.getAttribute("id")).toBeNull();
  expect(close.getAttribute("aria-expanded")).toBeNull();
  expect(close.getAttribute("aria-controls")).toBeNull();

  close.focus();
  expect(document.activeElement).toBe(close);
  close.click();
  flush();

  expect(root.querySelector("#nested-panel")).toBeNull();
  expect(document.activeElement).toBe(primary);
  expect(primary.getAttribute("aria-expanded")).toBe("false");
  expect(rootElement?.getAttribute("data-open")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("close accepts Solid accessors and panel render strategies stay distinct", () => {
  const diagnostics = DEV?.diagnostics.capture();
  let restoreElement: HTMLButtonElement | undefined;

  const root = mount(() => (
    <>
      <button type="button" ref={(element) => restoreElement = element}>
        Restore here
      </button>
      <Disclosure defaultOpen>
        {(slot) => (
          <>
            <DisclosureButton id="close-api-trigger">
              Toggle API
            </DisclosureButton>
            <DisclosurePanel id="close-api-panel">
              <button
                id="close-api"
                type="button"
                onClick={() => slot.close(() => restoreElement)}
              >
                Close API
              </button>
            </DisclosurePanel>
          </>
        )}
      </Disclosure>
      <Disclosure>
        <DisclosureButton id="static-trigger">Static</DisclosureButton>
        <DisclosurePanel id="static-panel" static>
          Always present
        </DisclosurePanel>
      </Disclosure>
      <Disclosure>
        <DisclosureButton id="persistent-trigger">Persistent</DisclosureButton>
        <DisclosurePanel id="persistent-panel" unmount={false}>
          Kept mounted
        </DisclosurePanel>
      </Disclosure>
    </>
  ));

  const closeApi = root.querySelector<HTMLButtonElement>("#close-api")!;
  closeApi.focus();
  closeApi.click();
  flush();
  expect(root.querySelector("#close-api-panel")).toBeNull();
  expect(document.activeElement).toBe(restoreElement);

  const staticPanel = root.querySelector<HTMLElement>("#static-panel")!;
  const staticTrigger = root.querySelector<HTMLElement>("#static-trigger")!;
  expect(staticPanel.hidden).toBe(false);
  expect(staticPanel.style.display).toBe("");
  expect(staticTrigger.getAttribute("aria-controls")).toBe("static-panel");

  const persistent = root.querySelector<HTMLElement>("#persistent-panel")!;
  const persistentTrigger = root.querySelector<HTMLButtonElement>(
    "#persistent-trigger",
  )!;
  expect(persistent.hidden).toBe(true);
  expect(persistent.style.display).toBe("none");
  expect(persistentTrigger.getAttribute("aria-controls")).toBe(
    "persistent-panel",
  );

  persistentTrigger.click();
  flush();
  expect(persistent.hidden).toBe(false);
  expect(persistent.style.display).toBe("");
  expect(persistent.getAttribute("data-open")).toBe("");

  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("disabled, right-click, and preventDefault suppress Disclosure toggles", () => {
  const diagnostics = DEV?.diagnostics.capture();
  const root = mount(() => (
    <>
      <Disclosure>
        <DisclosureButton id="disabled-trigger" disabled>
          Disabled
        </DisclosureButton>
        <DisclosurePanel id="disabled-panel">Disabled panel</DisclosurePanel>
      </Disclosure>
      <Disclosure>
        <DisclosureButton id="right-trigger">Right click</DisclosureButton>
        <DisclosurePanel id="right-panel">Right panel</DisclosurePanel>
      </Disclosure>
      <Disclosure>
        <DisclosureButton
          id="cancelled-trigger"
          onClick={(event) => event.preventDefault()}
        >
          Cancelled
        </DisclosureButton>
        <DisclosurePanel id="cancelled-panel">Cancelled panel</DisclosurePanel>
      </Disclosure>
    </>
  ));

  root.querySelector<HTMLButtonElement>("#disabled-trigger")!.click();
  root.querySelector("#right-trigger")!.dispatchEvent(
    new MouseEvent("click", { bubbles: true, button: 2, cancelable: true }),
  );
  root.querySelector<HTMLButtonElement>("#cancelled-trigger")!.click();
  flush();

  expect(root.querySelector("#disabled-panel")).toBeNull();
  expect(root.querySelector("#right-panel")).toBeNull();
  expect(root.querySelector("#cancelled-panel")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Disclosure survives a Solid 2 Loading boundary and preserves native button type rules", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const root = mount(() => (
    <Loading fallback={<span id="disclosure-fallback">Loading</span>}>
      <Disclosure>
        <DisclosureButton id="default-type">Default</DisclosureButton>
        <DisclosurePanel id="suspense-panel">Ready</DisclosurePanel>
      </Disclosure>
      <Disclosure>
        <DisclosureButton id="explicit-type" type="submit">
          Submit
        </DisclosureButton>
      </Disclosure>
      <Disclosure>
        <DisclosureButton as="div" id="div-trigger" role="button">
          Div trigger
        </DisclosureButton>
      </Disclosure>
    </Loading>
  ));

  expect(root.querySelector("#disclosure-fallback")).toBeNull();
  expect(root.querySelector<HTMLButtonElement>("#default-type")?.type).toBe(
    "button",
  );
  expect(root.querySelector<HTMLButtonElement>("#explicit-type")?.type).toBe(
    "submit",
  );
  expect(root.querySelector("#div-trigger")?.hasAttribute("type")).toBe(
    false,
  );

  root.querySelector<HTMLButtonElement>("#default-type")!.click();
  flush();
  await Promise.resolve();
  flush();
  expect(root.querySelector("#suspense-panel")?.textContent).toBe("Ready");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
