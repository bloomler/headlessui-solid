import { render } from "@solidjs/web";
import { createSignal, DEV, flush, type Setter } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  Dialog,
  DialogBackdrop,
  DialogDescription,
  DialogPanel,
  DialogTitle,
} from "../src/components/dialog/dialog.tsx";
import { Portal } from "../src/components/portal/portal.tsx";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
  // A transition crosses its prepare frame, its apply frame, and the frame
  // where the browser exposes/completes CSS transition animations.
  for (let frame = 0; frame < 3; frame++) {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
    flush();
  }
  await Promise.resolve();
  flush();
}

function mount(view: () => ReturnType<typeof Dialog>): HTMLDivElement {
  host = document.createElement("div");
  host.id = "dialog-browser-app";
  document.body.append(host);
  dispose = render(view, host);
  return host;
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

test("controlled Dialog manages ARIA, focus, inertness, scroll, panel containment, and outside clicks", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const requests: false[] = [];

  function Example() {
    const [open, setOpen] = createSignal(false);
    return (
      <>
        <button
          type="button"
          id="browser-dialog-opener"
          onClick={() => setOpen(true)}
        >
          Open account
        </button>
        <Dialog
          autofocus={false}
          open={open()}
          onClose={(value) => {
            requests.push(value);
            setOpen(value);
          }}
        >
          {(slot) => (
            <>
              <DialogBackdrop data-testid="dialog-backdrop" />
              <DialogPanel data-testid="dialog-panel">
                <DialogTitle id="browser-dialog-title">
                  {slot.open ? "Account settings" : "Closed"}
                </DialogTitle>
                <DialogDescription id="browser-dialog-description">
                  Update your profile
                </DialogDescription>
                <button type="button">Save account</button>
              </DialogPanel>
            </>
          )}
        </Dialog>
      </>
    );
  }

  const app = mount(() => <Example />);
  await settle();
  await page.getByRole("button", { name: "Open account" }).click();
  await settle();

  const dialog = page.getByRole("dialog");
  await expect.element(dialog).toBeVisible();
  await expect.element(dialog).toHaveAttribute("aria-modal", "true");
  await expect.element(dialog).toHaveAttribute(
    "aria-labelledby",
    "browser-dialog-title",
  );
  await expect.element(dialog).toHaveAttribute(
    "aria-describedby",
    "browser-dialog-description",
  );
  expect(document.activeElement?.textContent).toBe("Save account");
  expect(document.documentElement.style.overflow).toBe("hidden");
  expect(app.inert).toBe(true);

  await page.getByRole("button", { name: "Save account" }).click();
  await settle();
  expect(requests).toEqual([]);

  const backdrop = document.querySelector<HTMLElement>(
    '[data-testid="dialog-backdrop"]',
  )!;
  // The unstyled fixture intentionally has no box for Playwright to target.
  // Drive the browser's pointer sequence directly; createOutsideClick closes
  // on pointerup paired with the pointerdown target.
  backdrop.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, composed: true }),
  );
  backdrop.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, composed: true }),
  );
  await settle();
  await expect.element(dialog).not.toBeInTheDocument();
  expect(requests).toEqual([false]);
  expect(document.activeElement?.id).toBe("browser-dialog-opener");
  expect(document.documentElement.style.overflow).toBe("");
  expect(app.inert).toBe(false);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("nested Dialogs transfer top-layer Escape, focus trapping, and restoration", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  function Example() {
    const [outer, setOuter] = createSignal(false);
    const [inner, setInner] = createSignal(false);
    return (
      <>
        <button
          type="button"
          id="nested-dialog-opener"
          onClick={() => setOuter(true)}
        >
          Open outer dialog
        </button>
        <Dialog autofocus={false} open={outer()} onClose={setOuter}>
          <DialogPanel>
            <button
              type="button"
              id="nested-dialog-inner-opener"
              onClick={() => setInner(true)}
            >
              Open inner dialog
            </button>
            <button type="button">Outer last</button>
            <Dialog autofocus={false} open={inner()} onClose={setInner}>
              <DialogPanel>
                <button type="button" id="nested-dialog-inner-first">
                  Inner first
                </button>
                <button type="button">Inner last</button>
              </DialogPanel>
            </Dialog>
          </DialogPanel>
        </Dialog>
      </>
    );
  }

  mount(() => <Example />);
  await page.getByRole("button", { name: "Open outer dialog" }).click();
  await settle();
  expect(document.activeElement?.id).toBe("nested-dialog-inner-opener");

  await page.getByRole("button", { name: "Open inner dialog" }).click();
  await settle();
  expect(document.querySelectorAll("[role=dialog]")).toHaveLength(2);
  expect(document.activeElement?.id).toBe("nested-dialog-inner-first");

  await userEvent.tab();
  await settle();
  expect(document.activeElement?.textContent).toBe("Inner last");
  await userEvent.tab();
  await settle();
  expect(document.activeElement?.id).toBe("nested-dialog-inner-first");

  await userEvent.keyboard("{Escape}");
  await settle();
  expect(document.querySelectorAll("[role=dialog]")).toHaveLength(1);
  expect(document.activeElement?.id).toBe("nested-dialog-inner-opener");

  await userEvent.keyboard("{Escape}");
  await settle();
  expect(document.querySelectorAll("[role=dialog]")).toHaveLength(0);
  expect(document.activeElement?.id).toBe("nested-dialog-opener");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("portals remain inside the Dialog interaction boundary and transition/render strategies share the root element", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setOpen!: Setter<boolean>;
  let afterLeave = 0;

  function Example() {
    const [open, updateOpen] = createSignal(true);
    setOpen = updateOpen;
    return (
      <Dialog
        as="article"
        autofocus={false}
        enter="enter"
        enterFrom="enter-from"
        enterTo="enter-to"
        leave="leave"
        leaveFrom="leave-from"
        leaveTo="leave-to"
        onClose={updateOpen}
        open={open()}
        transition
        unmount={false}
        afterLeave={() => afterLeave++}
      >
        <DialogBackdrop transition data-testid="transition-backdrop" />
        <DialogPanel transition data-testid="transition-panel">
          <button type="button" id="transition-action">Action</button>
          <Portal>
            <button type="button" id="dialog-nested-portal">
              Portaled action
            </button>
          </Portal>
        </DialogPanel>
      </Dialog>
    );
  }

  mount(() => <Example />);
  await settle();
  const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
  expect(dialog.tagName).toBe("ARTICLE");
  expect(dialog.parentElement?.hasAttribute("data-headlessui-portal")).toBe(
    true,
  );
  expect(dialog.querySelector("[role=dialog]")).toBeNull();

  await page.getByRole("button", { name: "Portaled action" }).click();
  await settle();
  expect(document.querySelector("[role=dialog]")).not.toBeNull();

  setOpen(false);
  await settle();
  expect(dialog.hidden).toBe(true);
  expect(dialog.style.display).toBe("none");
  expect(afterLeave).toBe(1);

  setOpen(true);
  await settle();
  expect(dialog.hidden).toBe(false);
  expect(dialog.getAttribute("data-open")).toBe("");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("a Dialog boundary stays visible while portaled panel and backdrop leave", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setOpen!: Setter<boolean>;

  function Example() {
    const [open, updateOpen] = createSignal(false);
    setOpen = updateOpen;
    return (
      <>
        <style>
          {`
            .dialog-leave {
              opacity: 1;
              transition-property: opacity;
              transition-duration: 140ms;
            }
            .dialog-leave[data-closed] { opacity: 0; }
          `}
        </style>
        <Dialog autofocus={false} open={open()} onClose={updateOpen}>
          <DialogBackdrop
            class="dialog-leave"
            data-testid="leaving-dialog-backdrop"
            transition
          />
          <DialogPanel
            class="dialog-leave"
            data-testid="leaving-dialog-panel"
            transition
          >
            Content
          </DialogPanel>
        </Dialog>
      </>
    );
  }

  mount(() => <Example />);
  await settle();
  setOpen(true);
  flush();
  await settle();
  for (let frame = 0; frame < 10; frame++) {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
    flush();
  }
  const dialog = document.querySelector<HTMLElement>("[role=dialog]")!;
  const panel = document.querySelector<HTMLElement>(
    '[data-testid="leaving-dialog-panel"]',
  )!;

  setOpen(false);
  flush();
  for (let microtask = 0; microtask < 4; microtask++) {
    await Promise.resolve();
    flush();
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  expect(panel.isConnected).toBe(true);
  expect(panel.getAttribute("data-leave")).toBe("");
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  expect(dialog.hidden).toBe(false);
  expect(getComputedStyle(dialog).display).not.toBe("none");
  expect(
    panel.getAnimations().some((animation) =>
      animation.constructor.name === "CSSTransition" &&
      animation.playState === "running"
    ),
  ).toBe(true);

  await expect.poll(
    () => document.querySelector('[data-testid="leaving-dialog-panel"]'),
    { timeout: 2_000 },
  ).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("a static closed Dialog remains rendered without enabling modal effects", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Dialog
      autofocus={false}
      id="browser-static-dialog"
      onClose={() => {}}
      open={false}
      static
    >
      Static dialog
    </Dialog>
  ));
  await settle();

  const dialog = document.getElementById("browser-static-dialog")!;
  expect(dialog.hidden).toBe(false);
  expect(dialog.getAttribute("aria-modal")).toBeNull();
  expect(document.documentElement.style.overflow).toBe("");
  expect(document.querySelectorAll("[data-headlessui-focus-guard]"))
    .toHaveLength(
      0,
    );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
