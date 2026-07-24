import { type JSX, render } from "@solidjs/web";
import { DEV, type Element, flush } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import {
  Popover,
  PopoverBackdrop,
  PopoverButton,
  PopoverGroup,
  PopoverOverlay,
  PopoverPanel,
} from "../src/components/popover/popover.tsx";
import { Transition } from "../src/components/transition/transition.tsx";

const MULTIPLE_BUTTON_WARNING =
  "You are already using a <Popover.Button /> but only 1 <Popover.Button /> is supported.";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
  await Promise.resolve();
  flush();
}

function mount(view: () => Element): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(view, host);
  flush();
  return host;
}

function key(target: HTMLElement, value: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: value,
  });
  target.dispatchEvent(event);
  flush();
  return event;
}

afterEach(async () => {
  vi.restoreAllMocks();
  dispose?.();
  dispose = undefined;
  await settle();
  host?.remove();
  host = undefined;
  document.getElementById("headlessui-portal-root")?.remove();
  document.body.replaceChildren();
});

test("render props, refs, backdrop alias, and panel render strategies compose", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let rootElement: HTMLElement | undefined;
  const root = mount(() => (
    <>
      <Popover
        as="section"
        id="semantic-popover"
        ref={(element) => rootElement = element}
      >
        {(slot) => (
          <>
            <output id="popover-slot">
              {slot.open ? "root open" : "root closed"}
            </output>
            <PopoverButton id="semantic-trigger">
              {(button) => button.open ? "Close" : "Open"}
            </PopoverButton>
            <PopoverBackdrop id="semantic-backdrop" static>
              {(backdrop) =>
                backdrop.open ? "Backdrop open" : "Backdrop closed"}
            </PopoverBackdrop>
            <PopoverPanel as="article" id="semantic-panel" static>
              {(panel) => panel.open ? "Panel open" : "Panel closed"}
            </PopoverPanel>
          </>
        )}
      </Popover>
      <Popover>
        <PopoverButton id="persistent-trigger">Persistent</PopoverButton>
        <PopoverBackdrop id="persistent-backdrop" unmount={false} />
        <PopoverPanel id="persistent-panel" unmount={false}>
          Retained
        </PopoverPanel>
      </Popover>
    </>
  ));
  await settle();

  const trigger = root.querySelector<HTMLButtonElement>("#semantic-trigger")!;
  const backdrop = root.querySelector<HTMLElement>("#semantic-backdrop")!;
  const panel = root.querySelector<HTMLElement>("#semantic-panel")!;
  const persistentPanel = root.querySelector<HTMLElement>(
    "#persistent-panel",
  )!;

  expect(rootElement?.tagName).toBe("SECTION");
  expect(rootElement?.id).toBe("semantic-popover");
  expect(trigger.type).toBe("button");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(trigger.getAttribute("aria-controls")).toBeNull();
  expect(backdrop.getAttribute("aria-hidden")).toBe("true");
  expect(backdrop.textContent).toBe("Backdrop closed");
  expect(panel.tagName).toBe("ARTICLE");
  expect(panel.tabIndex).toBe(-1);
  expect(panel.textContent).toBe("Panel closed");
  expect(persistentPanel.hidden).toBe(true);
  expect(persistentPanel.style.display).toBe("none");
  expect(root.querySelector<HTMLElement>("#persistent-backdrop")?.hidden).toBe(
    true,
  );
  expect(PopoverOverlay).toBe(PopoverBackdrop);
  expect(Popover.Overlay).toBe(PopoverOverlay);

  trigger.click();
  await settle();
  expect(root.querySelector("#popover-slot")?.textContent).toBe("root open");
  expect(trigger.textContent).toBe("Close");
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(trigger.getAttribute("aria-controls")).toBe("semantic-panel");
  expect(backdrop.textContent).toBe("Backdrop open");
  expect(panel.textContent).toBe("Panel open");
  expect(rootElement?.hasAttribute("data-open")).toBe(true);

  backdrop.click();
  await settle();
  expect(root.querySelector("#popover-slot")?.textContent).toBe("root closed");
  expect(panel.textContent).toBe("Panel closed");

  root.querySelector<HTMLButtonElement>("#persistent-trigger")!.click();
  await settle();
  expect(persistentPanel.hidden).toBe(false);
  root.querySelector<HTMLButtonElement>("#persistent-trigger")!.click();
  await settle();
  expect(persistentPanel.hidden).toBe(true);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

function CustomButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  return <button {...props} />;
}

function CustomDiv(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} />;
}

test("Popover.Button preserves native type rules across Solid component targets", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const root = mount(() => (
    <>
      <Popover>
        <PopoverButton id="default-button">Default</PopoverButton>
      </Popover>
      <Popover>
        <PopoverButton id="submit-button" type="submit">Submit</PopoverButton>
      </Popover>
      <Popover>
        <PopoverButton as={CustomButton} id="component-button">
          Component button
        </PopoverButton>
      </Popover>
      <Popover>
        <PopoverButton as="div" id="div-button">Div</PopoverButton>
      </Popover>
      <Popover>
        <PopoverButton as={CustomDiv} id="component-div">
          Component div
        </PopoverButton>
      </Popover>
    </>
  ));
  await settle();

  expect(root.querySelector("#default-button")?.getAttribute("type")).toBe(
    "button",
  );
  expect(root.querySelector("#submit-button")?.getAttribute("type")).toBe(
    "submit",
  );
  expect(root.querySelector("#component-button")?.getAttribute("type")).toBe(
    "button",
  );
  expect(root.querySelector("#div-button")?.hasAttribute("type")).toBe(false);
  expect(root.querySelector("#component-div")?.hasAttribute("type")).toBe(
    false,
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("root and panel close APIs accept default, element, ref, accessor, and event targets", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let external: HTMLButtonElement | undefined;
  const elementRef = { current: null as HTMLButtonElement | null };
  const root = mount(() => (
    <>
      <button id="external" type="button" ref={(element) => external = element}>
        External
      </button>
      <button
        id="ref-target"
        type="button"
        ref={(element) => elementRef.current = element}
      >
        Ref target
      </button>
      <Popover>
        {(popover) => (
          <>
            <PopoverButton id="close-trigger">Trigger</PopoverButton>
            <PopoverPanel id="close-panel">
              {(panel) => (
                <>
                  <button
                    id="close-default"
                    type="button"
                    onClick={() => popover.close()}
                  >
                    Default close
                  </button>
                  <button
                    id="close-element"
                    type="button"
                    onClick={() => panel.close(external)}
                  >
                    Element close
                  </button>
                  <button
                    id="close-ref"
                    type="button"
                    onClick={() => popover.close(elementRef)}
                  >
                    Ref close
                  </button>
                  <button
                    id="close-accessor"
                    type="button"
                    onClick={() => panel.close(() => external)}
                  >
                    Accessor close
                  </button>
                  <button
                    id="close-event"
                    type="button"
                    onClick={popover.close}
                  >
                    Event close
                  </button>
                </>
              )}
            </PopoverPanel>
          </>
        )}
      </Popover>
    </>
  ));
  await settle();
  const trigger = root.querySelector<HTMLButtonElement>("#close-trigger")!;

  const closeAndExpect = async (
    closeId: string,
    expected: HTMLElement,
  ): Promise<void> => {
    trigger.click();
    await settle();
    root.querySelector<HTMLButtonElement>(`#${closeId}`)!.click();
    await settle();
    expect(root.querySelector("#close-panel")).toBeNull();
    expect(document.activeElement).toBe(expected);
  };

  await closeAndExpect("close-default", trigger);
  await closeAndExpect("close-element", external!);
  await closeAndExpect("close-ref", elementRef.current!);
  await closeAndExpect("close-accessor", external!);
  await closeAndExpect("close-event", trigger);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("multiple Popover.Button warnings follow all six upstream topologies", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const root = mount(() => (
    <>
      <Popover>
        <PopoverButton id="warn-plain-one">Plain one</PopoverButton>
        <PopoverButton>Plain two</PopoverButton>
        <PopoverPanel>Plain panel</PopoverPanel>
      </Popover>
      <Popover>
        <PopoverButton id="warn-transition-one">Transition one</PopoverButton>
        <PopoverButton>Transition two</PopoverButton>
        <Transition transition={false}>
          <PopoverPanel>Transition panel</PopoverPanel>
        </Transition>
      </Popover>
      <Popover>
        <PopoverButton id="inside-plain-trigger">Inside plain</PopoverButton>
        <PopoverPanel>
          <PopoverButton>Close one</PopoverButton>
          <PopoverButton>Close two</PopoverButton>
        </PopoverPanel>
      </Popover>
      <Popover>
        <PopoverButton id="inside-transition-trigger">
          Inside transition
        </PopoverButton>
        <Transition transition={false}>
          <PopoverPanel>
            <PopoverButton>Transition close one</PopoverButton>
            <PopoverButton>Transition close two</PopoverButton>
          </PopoverPanel>
        </Transition>
      </Popover>
      <Popover>
        <PopoverButton id="nested-warning-trigger">
          Nested warning
        </PopoverButton>
        <PopoverPanel>
          <Popover>
            <PopoverButton>Nested one</PopoverButton>
            <PopoverButton>Nested two</PopoverButton>
            <PopoverPanel>Nested panel</PopoverPanel>
          </Popover>
        </PopoverPanel>
      </Popover>
      <Popover>
        <PopoverButton id="nested-panel-trigger">Nested panel</PopoverButton>
        <PopoverPanel>
          <Popover>
            <PopoverButton>Nested trigger</PopoverButton>
            <PopoverPanel>
              <PopoverButton>Nested close one</PopoverButton>
              <PopoverButton>Nested close two</PopoverButton>
            </PopoverPanel>
          </Popover>
        </PopoverPanel>
      </Popover>
    </>
  ));
  await settle();

  expect(warning).toHaveBeenCalledTimes(2);
  expect(warning.mock.calls.map(([message]) => message)).toEqual([
    MULTIPLE_BUTTON_WARNING,
    MULTIPLE_BUTTON_WARNING,
  ]);

  root.querySelector<HTMLButtonElement>("#inside-plain-trigger")!.click();
  await settle();
  root.querySelector<HTMLButtonElement>("#inside-transition-trigger")!.click();
  await settle();
  expect(warning).toHaveBeenCalledTimes(2);

  root.querySelector<HTMLButtonElement>("#nested-warning-trigger")!.click();
  await settle();
  expect(warning).toHaveBeenCalledTimes(3);
  expect(warning).toHaveBeenLastCalledWith(MULTIPLE_BUTTON_WARNING);

  root.querySelector<HTMLButtonElement>("#nested-panel-trigger")!.click();
  await settle();
  const nestedTrigger = Array.from(root.querySelectorAll("button")).find(
    (button) => button.textContent === "Nested trigger",
  )!;
  nestedTrigger.click();
  await settle();
  expect(warning).toHaveBeenCalledTimes(3);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Enter, Space, Escape, disabled buttons, and in-panel buttons preserve keyboard policy", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let bubbled = 0;
  const root = mount(() => (
    <div onKeyDown={() => bubbled++}>
      <Popover>
        <PopoverButton id="keyboard-trigger">Keyboard</PopoverButton>
        <PopoverPanel id="keyboard-panel">
          <button id="panel-action" type="button">Action</button>
          <PopoverButton id="inside-button">Close inside</PopoverButton>
        </PopoverPanel>
      </Popover>
      <Popover>
        <PopoverButton id="disabled-trigger" disabled>Disabled</PopoverButton>
        <PopoverPanel id="disabled-panel">Disabled panel</PopoverPanel>
      </Popover>
    </div>
  ));
  await settle();
  const trigger = root.querySelector<HTMLButtonElement>("#keyboard-trigger")!;

  trigger.focus();
  const enter = key(trigger, "Enter");
  await settle();
  expect(enter.defaultPrevented).toBe(true);
  expect(bubbled).toBe(0);
  expect(root.querySelector("#keyboard-panel")).not.toBeNull();

  const escape = key(trigger, "Escape");
  await settle();
  expect(escape.defaultPrevented).toBe(true);
  expect(root.querySelector("#keyboard-panel")).toBeNull();
  expect(bubbled).toBe(0);

  const space = key(trigger, " ");
  await settle();
  expect(space.defaultPrevented).toBe(true);
  expect(root.querySelector("#keyboard-panel")).not.toBeNull();
  const inside = Array.from(root.querySelectorAll("button")).find((button) =>
    button.textContent === "Close inside"
  )!;
  inside.focus();
  const insideEnter = key(inside, "Enter");
  await settle();
  expect(insideEnter.defaultPrevented).toBe(true);
  expect(root.querySelector("#keyboard-panel")).toBeNull();
  expect(document.activeElement).toBe(trigger);

  const disabled = root.querySelector<HTMLButtonElement>("#disabled-trigger")!;
  expect(key(disabled, "Enter").defaultPrevented).toBe(false);
  disabled.click();
  await settle();
  expect(root.querySelector("#disabled-panel")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("groups close siblings while nested popovers retain independent state", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const root = mount(() => (
    <>
      <PopoverGroup>
        <Popover>
          <PopoverButton id="group-one-trigger">One</PopoverButton>
          <PopoverPanel id="group-one-panel">One panel</PopoverPanel>
        </Popover>
        <Popover>
          <PopoverButton id="group-two-trigger">Two</PopoverButton>
          <PopoverPanel id="group-two-panel">Two panel</PopoverPanel>
        </Popover>
      </PopoverGroup>
      <Popover>
        <PopoverButton id="outer-trigger">Outer</PopoverButton>
        <PopoverPanel id="outer-panel">
          <Popover>
            <PopoverButton id="inner-trigger">Inner</PopoverButton>
            <PopoverPanel id="inner-panel">Inner panel</PopoverPanel>
          </Popover>
        </PopoverPanel>
      </Popover>
    </>
  ));
  await settle();

  root.querySelector<HTMLButtonElement>("#group-one-trigger")!.click();
  await settle();
  expect(root.querySelector("#group-one-panel")).not.toBeNull();
  root.querySelector<HTMLButtonElement>("#group-two-trigger")!.click();
  await settle();
  expect(root.querySelector("#group-one-panel")).toBeNull();
  expect(root.querySelector("#group-two-panel")).not.toBeNull();

  root.querySelector<HTMLButtonElement>("#outer-trigger")!.click();
  await settle();
  root.querySelector<HTMLButtonElement>("#inner-trigger")!.click();
  await settle();
  expect(root.querySelector("#outer-panel")).not.toBeNull();
  expect(root.querySelector("#inner-panel")).not.toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("portalled focus sentinels retain the upstream marker and skip to the next control", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <>
      <Popover>
        <PopoverButton id="sentinel-trigger">Portal focus</PopoverButton>
        <PopoverPanel id="sentinel-panel" portal>
          <a id="sentinel-first" href="#first">First</a>
          <a id="sentinel-last" href="#last">Last</a>
        </PopoverPanel>
      </Popover>
      <button id="sentinel-after" type="button">After</button>
    </>
  ));
  await settle();
  document.getElementById("sentinel-trigger")?.click();
  await settle();

  const guards = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      '[data-headlessui-focus-guard="true"]',
    ),
  );
  expect(guards).toHaveLength(3);
  guards.at(-1)?.focus();
  await settle();
  expect(document.activeElement?.id).toBe("sentinel-after");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
