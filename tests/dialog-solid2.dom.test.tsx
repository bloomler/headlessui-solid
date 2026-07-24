import { render } from "@solidjs/web";
import {
  createSignal,
  DEV,
  type Element as SolidElement,
  flush,
  type Setter,
  Show,
} from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import {
  Dialog,
  DialogBackdrop,
  DialogDescription,
  DialogPanel,
  DialogTitle,
} from "../src/components/dialog/dialog.tsx";
import { Transition } from "../src/components/transition/transition.tsx";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

async function settle(): Promise<void> {
  // Dialog crosses a Transition boundary and a deferred Portal target. Drain
  // both owned effect work and the small promise chain used for transition
  // nesting before asserting the connected DOM.
  for (let pass = 0; pass < 8; pass++) {
    flush();
    await Promise.resolve();
  }
  flush();
}

async function settleTransition(): Promise<void> {
  await settle();
  if (typeof requestAnimationFrame === "function") {
    for (let frame = 0; frame < 3; frame++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
      flush();
    }
  }
  await settle();
}

function mount(view: () => SolidElement): HTMLDivElement {
  host = document.createElement("div");
  host.id = "dialog-test-app";
  document.body.append(host);
  dispose = render(view, host);
  flush();
  return host;
}

function pointerClick(target: globalThis.Element): PointerEvent {
  const down = new MouseEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    composed: true,
  }) as PointerEvent;
  const up = new MouseEvent("pointerup", {
    bubbles: true,
    cancelable: true,
    composed: true,
  }) as PointerEvent;
  target.dispatchEvent(down);
  target.dispatchEvent(up);
  flush();
  return up;
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("Dialog is controlled and wires its role, title, description, panel, inertness, and scroll lock", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setOpen!: Setter<boolean>;
  let dialogRef: HTMLElement | null = null;
  const requests: false[] = [];

  function Example() {
    const [open, updateOpen] = createSignal(false);
    setOpen = updateOpen;
    return (
      <>
        <button
          type="button"
          id="dialog-opener"
          onClick={() => updateOpen(true)}
        >
          Open
        </button>
        <Dialog
          autofocus={false}
          open={open()}
          ref={(element) => dialogRef = element}
          onClose={(value) => {
            requests.push(value);
            updateOpen(value);
          }}
        >
          {(slot) => (
            <>
              <DialogBackdrop id="dialog-backdrop" />
              <DialogPanel id="dialog-panel">
                <DialogTitle id="dialog-title">
                  {slot.open ? "Account" : "Closed"}
                </DialogTitle>
                <DialogDescription id="dialog-description">
                  Edit account
                </DialogDescription>
                <button type="button" id="dialog-inside">Inside</button>
              </DialogPanel>
            </>
          )}
        </Dialog>
      </>
    );
  }

  const app = mount(() => <Example />);
  await settle();
  expect(document.querySelector("[role=dialog]")).toBeNull();
  expect(document.documentElement.style.overflow).toBe("");

  app.querySelector<HTMLButtonElement>("#dialog-opener")!.click();
  await settle();

  const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
  expect(dialogRef).toBe(dialog);
  expect(dialog.id).toMatch(/^headlessui-dialog-/);
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(dialog.getAttribute("aria-labelledby")).toBe("dialog-title");
  expect(dialog.getAttribute("aria-describedby")).toBe("dialog-description");
  expect(dialog.getAttribute("data-open")).toBe("");
  expect(
    document.querySelector("#dialog-backdrop")?.getAttribute("aria-hidden"),
  )
    .toBe("true");
  expect(document.querySelector("#dialog-title")?.textContent).toBe(
    "Account",
  );
  expect(document.documentElement.style.overflow).toBe("hidden");
  expect(app.inert).toBe(true);
  expect(app.getAttribute("aria-hidden")).toBe("true");

  pointerClick(document.getElementById("dialog-inside")!);
  await settle();
  expect(requests).toEqual([]);
  expect(document.querySelector("[role=dialog]")).not.toBeNull();

  pointerClick(app);
  await settle();
  expect(requests).toEqual([false]);
  expect(document.querySelector("[role=dialog]")).toBeNull();
  expect(document.documentElement.style.overflow).toBe("");
  expect(Boolean(app.inert)).toBe(false);
  expect(app.getAttribute("aria-hidden")).toBeNull();

  setOpen(true);
  await settle();
  expect(document.querySelector("[role=dialog]")).not.toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Escape closes only the top-most nested Dialog and restores focus", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let outerProjectionRuns = 0;

  function OuterProjectionProbe() {
    outerProjectionRuns += 1;
    return <span id="outer-projection-probe" hidden />;
  }

  function Example() {
    const [outer, setOuter] = createSignal(false);
    const [inner, setInner] = createSignal(false);
    return (
      <>
        <button type="button" id="open-outer" onClick={() => setOuter(true)}>
          Open outer
        </button>
        <Dialog autofocus={false} open={outer()} onClose={setOuter}>
          <DialogPanel>
            <OuterProjectionProbe />
            <button
              type="button"
              id="open-inner"
              onClick={() => setInner(true)}
            >
              Open inner
            </button>
            <button type="button" id="outer-last">Outer last</button>
            <Show when={inner()}>
              <Dialog
                autofocus={false}
                open
                onClose={() => setInner(false)}
              >
                <DialogPanel>
                  <button type="button" id="inner-first">Inner first</button>
                </DialogPanel>
              </Dialog>
            </Show>
          </DialogPanel>
        </Dialog>
      </>
    );
  }

  const app = mount(() => <Example />);
  app.querySelector<HTMLButtonElement>("#open-outer")!.click();
  await settle();
  expect(document.activeElement?.id).toBe("open-inner");
  expect(outerProjectionRuns).toBe(1);

  document.getElementById("open-inner")!.click();
  await settle();
  expect(document.querySelectorAll("[role=dialog]")).toHaveLength(2);
  expect(document.activeElement?.id).toBe("inner-first");
  expect(outerProjectionRuns).toBe(1);

  globalThis.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    }),
  );
  await settle();
  expect(document.querySelectorAll("[role=dialog]")).toHaveLength(1);
  expect(document.activeElement?.id).toBe("open-inner");

  globalThis.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    }),
  );
  await settle();
  expect(document.querySelectorAll("[role=dialog]")).toHaveLength(0);
  expect(document.activeElement?.id).toBe("open-outer");
  expect(outerProjectionRuns).toBe(1);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Escape respects a focused field that cancels the event", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setCancelEscape!: Setter<boolean>;
  const requests: false[] = [];

  function Example() {
    const [cancelEscape, updateCancelEscape] = createSignal(true);
    const [open, setOpen] = createSignal(true);
    setCancelEscape = updateCancelEscape;
    return (
      <Dialog
        autofocus={false}
        open={open()}
        onClose={(value) => {
          requests.push(value);
          setOpen(value);
        }}
      >
        <DialogPanel>
          <input
            id="escape-field"
            onKeyDown={(event) => {
              if (!cancelEscape()) return;
              event.preventDefault();
              event.stopPropagation();
            }}
          />
        </DialogPanel>
      </Dialog>
    );
  }

  mount(() => <Example />);
  await settle();
  const field = document.getElementById("escape-field")!;
  pointerClick(field);
  await settle();
  expect(requests).toEqual([]);
  field.focus();
  field.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    }),
  );
  await settle();
  expect(requests).toEqual([]);
  expect(document.querySelector("[role=dialog]")).not.toBeNull();

  setCancelEscape(false);
  flush();
  field.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    }),
  );
  await settle();
  expect(requests).toEqual([false]);
  expect(document.querySelector("[role=dialog]")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("initial focus waits for Portal adoption and prefers data-autofocus", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <Dialog open onClose={() => {}}>
      <button id="ordinary-focus" type="button">Ordinary</button>
      <button id="preferred-focus" type="button" data-autofocus>
        Preferred
      </button>
    </Dialog>
  ));
  await settle();

  expect(document.activeElement?.id).toBe("preferred-focus");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("static and hidden render strategies preserve controlled interactivity", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setOpen!: Setter<boolean>;

  function Example() {
    const [open, updateOpen] = createSignal(false);
    setOpen = updateOpen;
    return (
      <>
        <Dialog
          autofocus={false}
          id="static-dialog"
          open={open()}
          onClose={updateOpen}
          static
        >
          Static
        </Dialog>
        <Dialog
          autofocus={false}
          id="persistent-dialog"
          open={open()}
          onClose={updateOpen}
          unmount={false}
        >
          Persistent
        </Dialog>
      </>
    );
  }

  mount(() => <Example />);
  await settle();
  const staticDialog = document.getElementById("static-dialog")!;
  const persistent = document.getElementById("persistent-dialog")!;
  expect(staticDialog.hidden).toBe(false);
  expect(staticDialog.getAttribute("aria-modal")).toBeNull();
  expect(persistent.hidden).toBe(true);
  expect(persistent.style.display).toBe("none");

  setOpen(true);
  await settle();
  expect(persistent.hidden).toBe(false);
  expect(persistent.style.display).toBe("");
  expect(persistent.getAttribute("aria-modal")).toBe("true");

  setOpen(false);
  await settle();
  expect(persistent.hidden).toBe(true);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("role validation and family render callbacks receive the Dialog slot", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  let setRole!: Setter<string>;

  function Example() {
    const [role, updateRole] = createSignal("dialog");
    setRole = updateRole;
    return (
      <Dialog
        autofocus={false}
        open
        onClose={() => {}}
        role={role() as "dialog"}
      >
        <DialogTitle id="slot-title">
          {(slot) => slot.open ? "Open title" : "Closed title"}
        </DialogTitle>
        <DialogDescription id="slot-description">
          {(slot) => JSON.stringify(slot)}
        </DialogDescription>
        <button type="button">Focusable</button>
      </Dialog>
    );
  }

  mount(() => <Example />);
  await settle();
  const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
  expect(dialog).not.toBeNull();
  expect(dialog.getAttribute("aria-labelledby")).toBe("slot-title");
  expect(dialog.getAttribute("aria-describedby")).toBe("slot-description");
  expect(document.getElementById("slot-title")?.textContent).toBe(
    "Open title",
  );
  expect(document.getElementById("slot-description")?.textContent).toBe(
    JSON.stringify({ open: true, disabled: false }),
  );

  setRole("alertdialog");
  flush();
  expect(dialog.getAttribute("role")).toBe("alertdialog");

  setRole("invalid");
  flush();
  await Promise.resolve();
  expect(dialog.getAttribute("role")).toBe("dialog");
  expect(warning).toHaveBeenCalledTimes(1);
  expect(warning.mock.calls[0]?.[0]).toContain("Invalid role [invalid]");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Dialog preserves zero-arity Solid child accessors across family projections", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const argumentCounts = {
    backdrop: [] as number[],
    dialog: [] as number[],
    panel: [] as number[],
    title: [] as number[],
  };
  let setValue!: Setter<string>;

  function Example() {
    const [value, updateValue] = createSignal("first");
    setValue = updateValue;

    function titleChildren() {
      argumentCounts.title.push(arguments.length);
      return <span id="title-accessor-value">{value()}</span>;
    }

    function panelChildren() {
      argumentCounts.panel.push(arguments.length);
      return (
        <>
          <DialogTitle id="accessor-title">{titleChildren}</DialogTitle>
          <span id="panel-accessor-value">{value()}</span>
        </>
      );
    }

    function backdropChildren() {
      argumentCounts.backdrop.push(arguments.length);
      return <span id="backdrop-accessor-value">{value()}</span>;
    }

    function dialogChildren() {
      argumentCounts.dialog.push(arguments.length);
      return (
        <>
          <DialogBackdrop id="accessor-backdrop">
            {backdropChildren}
          </DialogBackdrop>
          <DialogPanel id="accessor-panel">{panelChildren}</DialogPanel>
          <span id="dialog-accessor-value">{value()}</span>
        </>
      );
    }

    return (
      <Dialog autofocus={false} open onClose={() => {}}>
        {dialogChildren}
      </Dialog>
    );
  }

  mount(() => <Example />);
  await settle();
  expect(document.getElementById("dialog-accessor-value")?.textContent).toBe(
    "first",
  );
  expect(document.getElementById("panel-accessor-value")?.textContent).toBe(
    "first",
  );
  expect(document.getElementById("backdrop-accessor-value")?.textContent).toBe(
    "first",
  );
  expect(document.getElementById("title-accessor-value")?.textContent).toBe(
    "first",
  );
  expect(argumentCounts).toEqual({
    backdrop: [0],
    dialog: [0],
    panel: [0],
    title: [0],
  });

  setValue("second");
  await settle();
  expect(document.getElementById("dialog-accessor-value")?.textContent).toBe(
    "second",
  );
  expect(document.getElementById("panel-accessor-value")?.textContent).toBe(
    "second",
  );
  expect(document.getElementById("backdrop-accessor-value")?.textContent).toBe(
    "second",
  );
  expect(document.getElementById("title-accessor-value")?.textContent).toBe(
    "second",
  );
  expect(argumentCounts).toEqual({
    backdrop: [0],
    dialog: [0],
    panel: [0],
    title: [0],
  });
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("root and inherited transitions retain their element but release modal effects while closing", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setRootOpen!: Setter<boolean>;
  let setInheritedOpen!: Setter<boolean>;
  let rootAfterLeave = 0;

  function Example() {
    const [rootOpen, updateRootOpen] = createSignal(false);
    const [inheritedOpen, updateInheritedOpen] = createSignal(false);
    setRootOpen = updateRootOpen;
    setInheritedOpen = updateInheritedOpen;

    return (
      <>
        <Dialog
          autofocus={false}
          id="root-transition-dialog"
          open={rootOpen()}
          onClose={updateRootOpen}
          transition
          unmount={false}
          afterLeave={() => rootAfterLeave += 1}
        >
          <button type="button">Root action</button>
        </Dialog>
        <Transition
          as="div"
          id="inherited-transition-boundary"
          show={inheritedOpen()}
          transition={false}
          unmount={false}
        >
          <Dialog
            autofocus={false}
            id="inherited-transition-dialog"
            onClose={updateInheritedOpen}
            unmount={false}
          >
            <button type="button">Inherited action</button>
          </Dialog>
        </Transition>
      </>
    );
  }

  mount(() => <Example />);
  await settleTransition();
  const initialAfterLeaveCalls = rootAfterLeave;
  const rootDialog = document.getElementById("root-transition-dialog")!;
  expect(rootDialog.hidden).toBe(true);
  expect(document.documentElement.style.overflow).toBe("");

  setRootOpen(true);
  await settleTransition();
  expect(document.getElementById("root-transition-dialog")).toBe(rootDialog);
  expect(rootDialog.hidden).toBe(false);
  expect(rootDialog.getAttribute("aria-modal")).toBe("true");
  expect(document.documentElement.style.overflow).toBe("hidden");

  setRootOpen(false);
  flush();
  await Promise.resolve();
  flush();
  expect(document.documentElement.style.overflow).toBe("");
  await settleTransition();
  expect(rootDialog.hidden).toBe(true);
  expect(rootAfterLeave).toBe(initialAfterLeaveCalls + 1);

  setInheritedOpen(true);
  await settle();
  const inheritedDialog = document.getElementById(
    "inherited-transition-dialog",
  )!;
  expect(inheritedDialog.hidden).toBe(false);
  expect(inheritedDialog.getAttribute("aria-modal")).toBe("true");
  expect(document.documentElement.style.overflow).toBe("hidden");

  setInheritedOpen(false);
  flush();
  await Promise.resolve();
  flush();
  expect(document.documentElement.style.overflow).toBe("");
  await settle();
  expect(document.getElementById("inherited-transition-dialog")).toBe(
    inheritedDialog,
  );
  expect(inheritedDialog.hidden).toBe(true);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("DialogPanel and DialogBackdrop reactively switch transition branches", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setTransition!: Setter<boolean>;

  function Example() {
    const [transition, updateTransition] = createSignal(false);
    setTransition = updateTransition;
    return (
      <Dialog autofocus={false} open onClose={() => {}}>
        <DialogBackdrop
          id="reactive-transition-backdrop"
          transition={transition()}
        />
        <DialogPanel
          id="reactive-transition-panel"
          transition={transition()}
        >
          <button type="button">Action</button>
        </DialogPanel>
      </Dialog>
    );
  }

  mount(() => <Example />);
  await settleTransition();
  const initialBackdrop = document.getElementById(
    "reactive-transition-backdrop",
  )!;
  const initialPanel = document.getElementById("reactive-transition-panel")!;

  setTransition(true);
  await settleTransition();
  const transitionedBackdrop = document.getElementById(
    "reactive-transition-backdrop",
  )!;
  const transitionedPanel = document.getElementById(
    "reactive-transition-panel",
  )!;
  expect(transitionedBackdrop).not.toBe(initialBackdrop);
  expect(transitionedPanel).not.toBe(initialPanel);
  expect(transitionedPanel.textContent).toBe("Action");

  setTransition(false);
  await settleTransition();
  const finalBackdrop = document.getElementById(
    "reactive-transition-backdrop",
  )!;
  const finalPanel = document.getElementById("reactive-transition-panel")!;
  expect(finalBackdrop).not.toBe(transitionedBackdrop);
  expect(finalPanel).not.toBe(transitionedPanel);
  expect(finalPanel.textContent).toBe("Action");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("an inherited Dialog reactively adds and removes its root transition boundary", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setTransition!: Setter<boolean>;

  function Example() {
    const [transition, updateTransition] = createSignal(false);
    setTransition = updateTransition;
    return (
      <Transition as="div" show transition={false}>
        <Dialog
          autofocus={false}
          id="reactive-root-transition-dialog"
          onClose={() => {}}
          transition={transition()}
        >
          <button type="button">Inherited action</button>
        </Dialog>
      </Transition>
    );
  }

  mount(() => <Example />);
  await settleTransition();
  const initialDialog = document.getElementById(
    "reactive-root-transition-dialog",
  )!;

  setTransition(true);
  await settleTransition();
  const transitionedDialog = document.getElementById(
    "reactive-root-transition-dialog",
  )!;
  expect(transitionedDialog).not.toBe(initialDialog);
  expect(transitionedDialog.textContent).toBe("Inherited action");

  setTransition(false);
  await settleTransition();
  const finalDialog = document.getElementById(
    "reactive-root-transition-dialog",
  )!;
  expect(finalDialog).not.toBe(transitionedDialog);
  expect(finalDialog.textContent).toBe("Inherited action");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Dialog closes when its rendered root disappears", async () => {
  const callbacks: Array<() => void> = [];
  class TestResizeObserver {
    constructor(callback: () => void) {
      callbacks.push(callback);
    }
    observe() {}
    disconnect() {}
  }
  const ownerWindow = document.defaultView!;
  const originalObserver = Object.getOwnPropertyDescriptor(
    ownerWindow,
    "ResizeObserver",
  );
  Object.defineProperty(ownerWindow, "ResizeObserver", {
    configurable: true,
    value: TestResizeObserver,
  });

  try {
    let open = true;
    mount(() => (
      <Dialog
        autofocus={false}
        open={open}
        onClose={(next) => open = next}
      >
        <button type="button">Focusable</button>
      </Dialog>
    ));
    await settle();
    expect(callbacks.length).toBeGreaterThan(0);

    callbacks.forEach((callback) => callback());
    expect(open).toBe(false);
  } finally {
    if (originalObserver) {
      Object.defineProperty(
        ownerWindow,
        "ResizeObserver",
        originalObserver,
      );
    } else {
      delete (ownerWindow as Window & { ResizeObserver?: unknown })
        .ResizeObserver;
    }
  }
});

// Compile-time surface: aliases, statics, and Solid-native lowercase props.
void Dialog.Panel;
void Dialog.Title;
void Dialog.Description;
void DialogBackdrop;
void Show;
