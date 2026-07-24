import { render } from "@solidjs/web";
import { createSignal, DEV, flush, type Setter, Show } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  FocusTrap,
  FocusTrapFeatures,
} from "../src/components/focus-trap/focus-trap.tsx";
import { Portal } from "../src/components/portal/portal.tsx";

const FULL_FEATURES = FocusTrapFeatures.InitialFocus |
  FocusTrapFeatures.TabLock |
  FocusTrapFeatures.FocusLock |
  FocusTrapFeatures.RestoreFocus;

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  flush();
}

function mount(view: () => ReturnType<typeof FocusTrap>): void {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(view, host);
}

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  await settle();
  host?.remove();
  host = undefined;
  document.getElementById("headlessui-portal-root")?.remove();
});

test("FocusTrap prefers data-autofocus when AutoFocus is enabled", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <FocusTrap
      features={FocusTrapFeatures.InitialFocus | FocusTrapFeatures.AutoFocus}
    >
      <input id="autofocus-first" />
      <input id="autofocus-preferred" data-autofocus />
      <input id="autofocus-last" />
    </FocusTrap>
  ));
  await settle();

  expect(document.activeElement?.id).toBe("autofocus-preferred");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("FocusTrap focuses the first eligible element and skips hidden or disabled candidates", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <FocusTrap>
      <input id="initial-hidden" style={{ display: "none" }} />
      <button id="initial-disabled" type="button" disabled>Disabled</button>
      <input id="initial-first" />
      <input id="initial-second" />
    </FocusTrap>
  ));
  await settle();

  expect(document.activeElement?.id).toBe("initial-first");
  await userEvent.tab();
  await settle();
  expect(document.activeElement?.id).toBe("initial-second");
  await userEvent.tab();
  await settle();
  expect(document.activeElement?.id).toBe("initial-first");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("initialFocusFallback receives focus when the trap has no tabbable element", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let fallback: HTMLDivElement | undefined;

  mount(() => (
    <FocusTrap initialFocusFallback={() => fallback}>
      <div
        id="initial-fallback"
        tabindex={-1}
        ref={(element) => fallback = element}
      >
        Fallback
      </div>
    </FocusTrap>
  ));
  await settle();

  expect(document.activeElement?.id).toBe("initial-fallback");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("FocusTrap warns once when no focus destination exists", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  try {
    mount(() => (
      <FocusTrap>
        <span>No focus target</span>
      </FocusTrap>
    ));
    await settle();

    expect(warn).toHaveBeenCalledWith(
      "There are no focusable elements inside the <FocusTrap />",
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(diagnostics?.stop() ?? []).toEqual([]);
  } finally {
    warn.mockRestore();
  }
});

test("an explicit initialFocus accessor overrides native autofocus", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let explicit: HTMLInputElement | undefined;

  mount(() => (
    <FocusTrap initialFocus={() => explicit}>
      <input id="native-autofocus" autofocus />
      <input id="explicit-initial" ref={(element) => explicit = element} />
    </FocusTrap>
  ));
  await settle();

  expect(document.activeElement?.id).toBe("explicit-initial");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("features reactively enable and disable focus management", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setFeatures!: Setter<FocusTrapFeatures>;

  function Example() {
    const [features, updateFeatures] = createSignal(FocusTrapFeatures.None);
    setFeatures = updateFeatures;

    return (
      <>
        <button id="feature-outside" type="button">Outside</button>
        <FocusTrap features={features()}>
          <button id="feature-inside" type="button">Inside</button>
        </FocusTrap>
      </>
    );
  }

  mount(() => <Example />);
  await settle();
  document.getElementById("feature-outside")!.focus();
  expect(document.activeElement?.id).toBe("feature-outside");

  setFeatures(FULL_FEATURES);
  await settle();
  expect(document.activeElement?.id).toBe("feature-inside");
  expect(document.querySelectorAll("[data-headlessui-focus-guard]").length)
    .toBe(2);

  setFeatures(FocusTrapFeatures.None);
  await settle();
  document.getElementById("feature-outside")!.focus();
  await settle();
  expect(document.activeElement?.id).toBe("feature-outside");
  expect(document.querySelectorAll("[data-headlessui-focus-guard]").length)
    .toBe(0);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("unmount restores the element focused before entering the trap", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  function Example() {
    const [visible, setVisible] = createSignal(false);

    return (
      <>
        <button
          id="restore-opener"
          type="button"
          onClick={() => setVisible(true)}
        >
          Open trap
        </button>
        <Show when={visible()}>
          <FocusTrap>
            <button
              id="restore-close"
              type="button"
              onClick={() => setVisible(false)}
            >
              Close trap
            </button>
          </FocusTrap>
        </Show>
      </>
    );
  }

  mount(() => <Example />);
  await settle();
  await page.getByRole("button", { name: "Open trap" }).click();
  await settle();
  expect(document.activeElement?.id).toBe("restore-close");

  await page.getByRole("button", { name: "Close trap" }).click();
  await settle();
  expect(document.activeElement?.id).toBe("restore-opener");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("upstream skipped regression 1: one focusable element cannot be escaped", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <input id="single-outside" />
      <FocusTrap>
        <input id="single-inside" />
      </FocusTrap>
    </>
  ));
  await settle();
  expect(document.activeElement?.id).toBe("single-inside");

  await userEvent.tab();
  await settle();
  expect(document.activeElement?.id).toBe("single-inside");

  await userEvent.tab({ shift: true });
  await settle();
  expect(document.activeElement?.id).toBe("single-inside");

  document.getElementById("single-outside")!.focus();
  await settle();
  expect(document.activeElement?.id).toBe("single-inside");

  await userEvent.click(document.getElementById("single-inside")!);
  document.getElementById("single-outside")!.focus();
  await settle();
  expect(document.activeElement?.id).toBe("single-inside");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("upstream skipped regression 2: focus lock restores the last tabbed element", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <input id="multiple-outside" />
      <FocusTrap>
        <input id="multiple-b" />
        <input id="multiple-c" />
        <input id="multiple-d" />
      </FocusTrap>
    </>
  ));
  await settle();
  expect(document.activeElement?.id).toBe("multiple-b");

  await userEvent.tab();
  await settle();
  expect(document.activeElement?.id).toBe("multiple-c");
  document.getElementById("multiple-outside")!.focus();
  await settle();
  expect(document.activeElement?.id).toBe("multiple-c");

  await userEvent.click(document.getElementById("multiple-b")!);
  document.getElementById("multiple-outside")!.focus();
  await settle();
  expect(document.activeElement?.id).toBe("multiple-b");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("upstream skipped regression 3: repeated internal focus updates the lock target", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <input id="repeated-outside" />
      <FocusTrap>
        <input id="repeated-b" />
        <input id="repeated-c" />
        <input id="repeated-d" />
      </FocusTrap>
    </>
  ));
  await settle();

  document.getElementById("repeated-d")!.focus();
  await settle();
  expect(document.activeElement?.id).toBe("repeated-d");
  document.getElementById("repeated-outside")!.focus();
  await settle();
  expect(document.activeElement?.id).toBe("repeated-d");

  document.getElementById("repeated-c")!.focus();
  document.getElementById("repeated-outside")!.focus();
  await settle();
  expect(document.activeElement?.id).toBe("repeated-c");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("tab locking wraps despite unusual positive tabindex ordering", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <div tabindex={-1}>
        <input tabindex={2} id="tab-outside-a" />
        <input tabindex={1} id="tab-outside-b" />
      </div>
      <FocusTrap>
        <input tabindex={1} id="tab-inside-c" />
        <input id="tab-inside-d" />
      </FocusTrap>
    </>
  ));
  await settle();
  expect(document.activeElement?.id).toBe("tab-inside-c");

  await userEvent.tab();
  await settle();
  expect(document.activeElement?.id).toBe("tab-inside-d");
  await userEvent.tab();
  await settle();
  expect(document.activeElement?.id).toBe("tab-inside-c");
  await userEvent.tab({ shift: true });
  await settle();
  expect(document.activeElement?.id).toBe("tab-inside-d");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("additional Portal containers participate in focus lock", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let portalContainer: HTMLDivElement | undefined;

  mount(() => (
    <>
      <button id="portal-outside" type="button">Outside portal</button>
      <FocusTrap containers={() => portalContainer ? [portalContainer] : []}>
        <button id="portal-root-action" type="button">Root action</button>
        <Portal>
          <div ref={(element) => portalContainer = element}>
            <button id="portal-allowed" type="button">Portal action</button>
          </div>
        </Portal>
      </FocusTrap>
    </>
  ));
  await settle();
  await expect.element(page.getByRole("button", { name: "Portal action" }))
    .toBeVisible();

  document.getElementById("portal-allowed")!.focus();
  await settle();
  expect(document.activeElement?.id).toBe("portal-allowed");
  document.getElementById("portal-outside")!.focus();
  await settle();
  expect(document.activeElement?.id).toBe("portal-allowed");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("nested traps give tab and initial-focus ownership to the top layer", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  function Example() {
    const [innerVisible, setInnerVisible] = createSignal(false);

    return (
      <>
        <button id="nested-outside" type="button">Outside nested</button>
        <FocusTrap>
          <button id="outer-first" type="button">Outer first</button>
          <button
            id="open-inner"
            type="button"
            onClick={() => setInnerVisible(true)}
          >
            Open inner
          </button>
          <Show when={innerVisible()}>
            <FocusTrap>
              <button id="inner-first" type="button">Inner first</button>
              <button
                id="close-inner"
                type="button"
                onClick={() => setInnerVisible(false)}
              >
                Close inner
              </button>
            </FocusTrap>
          </Show>
        </FocusTrap>
      </>
    );
  }

  mount(() => <Example />);
  await settle();
  expect(document.activeElement?.id).toBe("outer-first");
  expect(document.querySelectorAll("[data-headlessui-focus-guard]").length)
    .toBe(2);

  await page.getByRole("button", { name: "Open inner" }).click();
  await settle();
  expect(document.activeElement?.id).toBe("inner-first");
  expect(document.querySelectorAll("[data-headlessui-focus-guard]").length)
    .toBe(2);

  document.getElementById("nested-outside")!.focus();
  await settle();
  expect(document.activeElement?.id).toBe("inner-first");

  await page.getByRole("button", { name: "Close inner" }).click();
  await settle();
  expect(document.activeElement?.id).toBe("open-inner");
  expect(document.querySelectorAll("[data-headlessui-focus-guard]").length)
    .toBe(2);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
