import { Portal as SolidPortal, render } from "@solidjs/web";
import {
  createSignal,
  DEV,
  type Element as SolidElement,
  flush,
  Show,
} from "solid-js";
import { afterEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { Dialog, DialogPanel } from "../src/components/dialog/dialog.tsx";
import {
  Popover,
  PopoverButton,
  PopoverPanel,
} from "../src/components/popover/popover.tsx";
import { Transition } from "../src/components/transition/transition.tsx";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
  for (let frame = 0; frame < 3; frame++) {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
    flush();
  }
  await Promise.resolve();
  flush();
}

function mount(view: () => SolidElement): HTMLDivElement {
  host = document.createElement("div");
  host.id = "dialog-parity-app";
  document.body.append(host);
  dispose = render(view, host);
  flush();
  return host;
}

function dispatchPointer(
  target: globalThis.Element,
  type: "pointerdown" | "pointerup",
): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    composed: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  target.dispatchEvent(event);
  flush();
  return event;
}

function pointerClick(target: globalThis.Element): void {
  dispatchPointer(target, "pointerdown");
  dispatchPointer(target, "pointerup");
}

function ShadowButton(props: {
  buttonId: string;
  hostId: string;
  onClick: () => void;
}): SolidElement {
  const attach = (element: HTMLDivElement) => {
    const root = element.shadowRoot ?? element.attachShadow({ mode: "open" });
    if (root.getElementById(props.buttonId)) return;
    const button = document.createElement("button");
    button.id = props.buttonId;
    button.type = "button";
    button.textContent = "Shadow action";
    button.addEventListener("click", props.onClick);
    root.append(button);
  };

  return <div id={props.hostId} ref={attach} />;
}

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  await settle();
  host?.remove();
  host = undefined;
  document.getElementById("headlessui-portal-root")?.remove();
  document.documentElement.removeAttribute("style");
  document.body.replaceChildren();
});

test("scroll lock stays owned while Transition hands off between Dialogs", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  function Example() {
    const [current, setCurrent] = createSignal<string | null>(null);

    const Layer = (props: { id: string }) => (
      <Transition
        as="div"
        show={current() === props.id}
        transition={false}
      >
        <Dialog autofocus={false} onClose={() => setCurrent(null)}>
          <DialogPanel>
            <button
              id={`close-${props.id}`}
              type="button"
              onClick={() => setCurrent(null)}
            >
              Close {props.id}
            </button>
          </DialogPanel>
        </Dialog>
      </Transition>
    );

    return (
      <>
        {(["one", "two", "three"] as const).map((id) => (
          <button
            id={`open-${id}`}
            type="button"
            onClick={() => setCurrent(id)}
          >
            Open {id}
          </button>
        ))}
        <Layer id="one" />
        <Layer id="two" />
        <Layer id="three" />
      </>
    );
  }

  mount(() => <Example />);
  await settle();
  expect(document.documentElement.style.overflow).toBe("");

  for (const id of ["one", "two", "three"] as const) {
    document.getElementById(`open-${id}`)!.click();
    await settle();
    expect(document.querySelectorAll("[role=dialog]")).toHaveLength(1);
    expect(document.documentElement.style.overflow).toBe("hidden");
  }

  document.getElementById("close-three")!.click();
  await settle();
  expect(document.querySelectorAll("[role=dialog]")).toHaveLength(0);
  expect(document.documentElement.style.overflow).toBe("");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("a Dialog opened from a Popover closes the Popover and restores its button", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  function Example() {
    const [dialogOpen, setDialogOpen] = createSignal(false);
    return (
      <>
        <Popover>
          <PopoverButton id="popover-dialog-trigger">
            Open Popover
          </PopoverButton>
          <PopoverPanel id="popover-dialog-panel">
            <button
              id="open-dialog-from-popover"
              type="button"
              onClick={() => setDialogOpen(true)}
            >
              Open dialog
            </button>
          </PopoverPanel>
        </Popover>
        <Dialog
          autofocus={false}
          open={dialogOpen()}
          onClose={setDialogOpen}
        >
          <DialogPanel>
            <button
              id="close-popover-dialog"
              type="button"
              onClick={() => setDialogOpen(false)}
            >
              Close dialog
            </button>
          </DialogPanel>
        </Dialog>
      </>
    );
  }

  mount(() => <Example />);
  await settle();
  expect(document.getElementById("popover-dialog-panel")).toBeNull();
  expect(document.querySelector("[role=dialog]")).toBeNull();

  await userEvent.click(document.getElementById("popover-dialog-trigger")!);
  await settle();
  expect(document.getElementById("popover-dialog-panel")).not.toBeNull();
  expect(document.querySelector("[role=dialog]")).toBeNull();
  expect(document.activeElement?.id).toBe("popover-dialog-trigger");

  await userEvent.click(
    document.getElementById("open-dialog-from-popover")!,
  );
  await settle();
  expect(document.getElementById("popover-dialog-panel")).toBeNull();
  expect(document.querySelector("[role=dialog]")).not.toBeNull();
  expect(document.activeElement?.id).toBe("close-popover-dialog");

  await userEvent.click(document.getElementById("close-popover-dialog")!);
  await settle();
  expect(document.getElementById("popover-dialog-panel")).toBeNull();
  expect(document.querySelector("[role=dialog]")).toBeNull();
  expect(document.activeElement?.id).toBe("popover-dialog-trigger");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("forms submit inside a Dialog without click propagation escaping its Portal", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let submissions = 0;
  let wrapperClicks = 0;

  function Example() {
    const [open, setOpen] = createSignal(true);
    return (
      <div id="dialog-event-wrapper" onClick={() => wrapperClicks += 1}>
        <Dialog autofocus={false} open={open()} onClose={setOpen}>
          <DialogPanel>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submissions += 1;
              }}
            >
              <input name="value" type="hidden" value="abc" />
              <button id="dialog-submit" type="submit">Submit</button>
            </form>
            <button
              id="dialog-propagation-close"
              type="button"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </DialogPanel>
        </Dialog>
      </div>
    );
  }

  mount(() => <Example />);
  await settle();
  await userEvent.click(document.getElementById("dialog-submit")!);
  await settle();
  expect(submissions).toBe(1);
  expect(wrapperClicks).toBe(0);
  expect(document.querySelector("[role=dialog]")).not.toBeNull();

  await userEvent.click(
    document.getElementById("dialog-propagation-close")!,
  );
  await settle();
  expect(document.querySelector("[role=dialog]")).toBeNull();
  expect(wrapperClicks).toBe(0);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("a pointer target removed during mousedown does not close the Dialog", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const requests: false[] = [];

  mount(() => (
    <Dialog
      autofocus={false}
      open
      onClose={(value) => requests.push(value)}
    >
      <DialogPanel>
        <div id="removed-target-wrapper">
          <button
            id="removed-pointer-target"
            type="button"
            onMouseDown={() =>
              document.getElementById("removed-target-wrapper")?.remove()}
          >
            Remove target
          </button>
        </div>
      </DialogPanel>
    </Dialog>
  ));
  await settle();

  const target = document.getElementById("removed-pointer-target")!;
  dispatchPointer(target, "pointerdown");
  target.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      composed: true,
    }),
  );
  expect(target.isConnected).toBe(false);
  dispatchPointer(document.body, "pointerup");
  await settle();

  expect(requests).toEqual([]);
  expect(document.querySelector("[role=dialog]")).not.toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("third-party Portal content remains clickable and focusable beside a Dialog", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let thirdPartyClicks = 0;
  let dialogFocuses = 0;
  const requests: false[] = [];

  mount(() => (
    <>
      <Dialog
        autofocus={false}
        open
        onClose={(value) => requests.push(value)}
      >
        <DialogPanel>
          <button
            id="dialog-focus-probe"
            type="button"
            onFocus={() => dialogFocuses += 1}
          >
            Dialog action
          </button>
        </DialogPanel>
      </Dialog>
      <SolidPortal>
        <button
          id="third-party-portal-action"
          type="button"
          onClick={() => thirdPartyClicks += 1}
        >
          Third-party action
        </button>
      </SolidPortal>
    </>
  ));
  await settle();
  expect(document.activeElement?.id).toBe("dialog-focus-probe");
  expect(dialogFocuses).toBe(1);

  const thirdParty = document.getElementById("third-party-portal-action")!;
  thirdParty.focus();
  await settle();
  expect(document.activeElement).toBe(thirdParty);
  expect(dialogFocuses).toBe(1);

  await userEvent.click(thirdParty);
  await settle();
  expect(thirdPartyClicks).toBe(1);
  expect(document.activeElement).toBe(thirdParty);
  expect(requests).toEqual([]);
  expect(document.querySelector("[role=dialog]")).not.toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Dialog panel containment follows composed paths through shadow roots", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const clicks: string[] = [];

  function Example() {
    const [open, setOpen] = createSignal(true);
    return (
      <Dialog autofocus={false} open={open()} onClose={setOpen}>
        <ShadowButton
          buttonId="outside-shadow-button"
          hostId="outside-shadow-host"
          onClick={() => clicks.push("outside")}
        />
        <DialogPanel>
          <button
            id="inside-light-button"
            type="button"
            onClick={() => clicks.push("light")}
          >
            Light action
          </button>
          <ShadowButton
            buttonId="inside-shadow-button"
            hostId="inside-shadow-host"
            onClick={() => clicks.push("inside")}
          />
        </DialogPanel>
      </Dialog>
    );
  }

  mount(() => <Example />);
  await settle();
  await userEvent.click(document.getElementById("inside-light-button")!);
  await settle();
  expect(clicks).toEqual(["light"]);
  expect(document.querySelector("[role=dialog]")).not.toBeNull();

  const insideShadow = document.getElementById("inside-shadow-host")!
    .shadowRoot!.getElementById("inside-shadow-button")!;
  await userEvent.click(insideShadow);
  await settle();
  expect(clicks).toEqual(["light", "inside"]);
  expect(document.querySelector("[role=dialog]")).not.toBeNull();

  const outsideShadow = document.getElementById("outside-shadow-host")!
    .shadowRoot!.getElementById("outside-shadow-button")!;
  await userEvent.click(outsideShadow);
  await settle();
  // In a real browser, Solid commits the pointerup close before the later
  // synthetic click can reach a node that has just been removed. React's
  // simulated-DOM helper batches that removal across its full click helper.
  // The observable Dialog contract is that the composed inside path remains
  // open while the composed outside path closes.
  expect(clicks).toEqual(["light", "inside"]);
  expect(document.querySelector("[role=dialog]")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("clicking inside the Dialog root but outside DialogPanel closes it", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  function Example() {
    const [open, setOpen] = createSignal(true);
    return (
      <Dialog autofocus={false} open={open()} onClose={setOpen}>
        <DialogPanel>
          <button id="panel-inside" type="button">Inside panel</button>
        </DialogPanel>
        <button id="dialog-root-outside-panel" type="button">
          Outside panel
        </button>
      </Dialog>
    );
  }

  mount(() => <Example />);
  await settle();
  await userEvent.click(document.getElementById("panel-inside")!);
  await settle();
  expect(document.querySelector("[role=dialog]")).not.toBeNull();

  await userEvent.click(
    document.getElementById("dialog-root-outside-panel")!,
  );
  await settle();
  expect(document.querySelector("[role=dialog]")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("a Dialog opened during mouseup ignores the pointer sequence that opened it", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  function Example() {
    const [open, setOpen] = createSignal(false);
    return (
      <>
        <button
          id="mouseup-dialog-trigger"
          type="button"
          onMouseUp={() => setOpen(true)}
        >
          Open on mouseup
        </button>
        <Dialog autofocus={false} open={open()} onClose={setOpen}>
          <DialogPanel>
            <button id="mouseup-dialog-inside" type="button">Inside</button>
          </DialogPanel>
        </Dialog>
      </>
    );
  }

  mount(() => <Example />);
  await settle();
  await userEvent.click(document.getElementById("mouseup-dialog-trigger")!);
  await settle();
  expect(document.querySelector("[role=dialog]")).not.toBeNull();

  await userEvent.click(document.getElementById("mouseup-dialog-inside")!);
  await settle();
  expect(document.querySelector("[role=dialog]")).not.toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("a pointer drag that starts inside and ends outside does not close the Dialog", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  function Example() {
    const [open, setOpen] = createSignal(true);
    return (
      <>
        <div id="drag-dialog-outside">Outside</div>
        <Dialog autofocus={false} open={open()} onClose={setOpen}>
          <DialogPanel>
            <button id="drag-dialog-inside" type="button">Inside</button>
          </DialogPanel>
        </Dialog>
      </>
    );
  }

  mount(() => <Example />);
  await settle();
  const inside = document.getElementById("drag-dialog-inside")!;
  const outside = document.getElementById("drag-dialog-outside")!;
  dispatchPointer(inside, "pointerdown");
  dispatchPointer(outside, "pointerup");
  await settle();
  expect(document.querySelector("[role=dialog]")).not.toBeNull();

  pointerClick(outside);
  await settle();
  expect(document.querySelector("[role=dialog]")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test.each(["mounted", "always"] as const)(
  "nested %s Dialogs close only the top layer on each outside click",
  async (strategy) => {
    const diagnostics = DEV?.diagnostics.capture();

    function Example() {
      const [outerOpen, setOuterOpen] = createSignal(false);
      const [innerOpen, setInnerOpen] = createSignal(false);

      const Inner = () => (
        <Dialog
          autofocus={false}
          open={innerOpen()}
          onClose={setInnerOpen}
        >
          <DialogPanel>
            <button id={`nested-${strategy}-inner-action`} type="button">
              Inner action
            </button>
          </DialogPanel>
        </Dialog>
      );

      return (
        <>
          <button
            id={`nested-${strategy}-outer-trigger`}
            type="button"
            onClick={() => setOuterOpen(true)}
          >
            Open outer
          </button>
          <Show when={outerOpen()}>
            <Dialog
              autofocus={false}
              open
              onClose={() => setOuterOpen(false)}
            >
              <DialogPanel>
                <button
                  id={`nested-${strategy}-inner-trigger`}
                  type="button"
                  onClick={() => setInnerOpen(true)}
                >
                  Open inner
                </button>
                {strategy === "always" ? <Inner /> : (
                  <Show when={innerOpen()}>
                    <Inner />
                  </Show>
                )}
              </DialogPanel>
            </Dialog>
          </Show>
        </>
      );
    }

    mount(() => <Example />);
    await settle();
    const outerTrigger = document.getElementById(
      `nested-${strategy}-outer-trigger`,
    )!;
    await userEvent.click(outerTrigger);
    await settle();
    const innerTrigger = document.getElementById(
      `nested-${strategy}-inner-trigger`,
    )!;
    expect(document.activeElement).toBe(innerTrigger);

    await userEvent.click(innerTrigger);
    await settle();
    expect(document.querySelectorAll("[role=dialog]")).toHaveLength(2);
    expect(document.activeElement?.id).toBe(
      `nested-${strategy}-inner-action`,
    );

    pointerClick(document.body);
    await settle();
    expect(document.querySelectorAll("[role=dialog]")).toHaveLength(1);
    expect(document.activeElement).toBe(innerTrigger);

    pointerClick(document.body);
    await settle();
    expect(document.querySelectorAll("[role=dialog]")).toHaveLength(0);
    expect(document.activeElement).toBe(outerTrigger);
    expect(diagnostics?.stop() ?? []).toEqual([]);
  },
);
