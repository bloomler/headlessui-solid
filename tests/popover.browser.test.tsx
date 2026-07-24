import { render } from "@solidjs/web";
import { createSignal, DEV, type Element, flush } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  Popover,
  PopoverBackdrop,
  PopoverButton,
  PopoverGroup,
  PopoverOverlay,
  PopoverPanel,
} from "../src/components/popover/popover.tsx";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  flush();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function mount(children: () => Element): void {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(children, host);
}

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  host?.remove();
  host = undefined;
  await settle();
});

test("button, panel, backdrop, keyboard, and in-panel close compose", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <form>
      <Popover>
        <PopoverButton id="basic-trigger">Account</PopoverButton>
        <PopoverBackdrop id="basic-backdrop" />
        <PopoverPanel id="basic-panel" focus>
          <a href="#profile" id="profile-link">Profile</a>
          <PopoverButton id="inside-close">Close account</PopoverButton>
        </PopoverPanel>
      </Popover>
    </form>
  ));
  await settle();

  const trigger = page.getByRole("button", { name: "Account", exact: true });
  await expect.element(trigger).toHaveAttribute("type", "button");
  await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  expect(document.getElementById("basic-panel")).toBeNull();
  expect(document.getElementById("basic-backdrop")).toBeNull();

  trigger.element().focus();
  await userEvent.keyboard("{Enter}");
  await settle();
  await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
  await expect.element(trigger).toHaveAttribute(
    "aria-controls",
    "basic-panel",
  );
  expect(document.getElementById("basic-backdrop")?.getAttribute("aria-hidden"))
    .toBe("true");
  expect(document.getElementById("basic-panel")?.tabIndex).toBe(-1);
  expect(document.activeElement?.id).toBe("profile-link");

  await page.getByRole("button", { name: "Close account", exact: true })
    .click();
  await settle();
  expect(document.getElementById("basic-panel")).toBeNull();
  expect(document.activeElement?.id).toBe("basic-trigger");

  await trigger.click();
  document.getElementById("basic-backdrop")?.click();
  await settle();
  expect(document.getElementById("basic-panel")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("groups close sibling popovers while nested popovers stay independent", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <PopoverGroup>
        <Popover>
          <PopoverButton id="first-trigger">First</PopoverButton>
          <PopoverPanel id="first-panel">
            <button type="button">First action</button>
          </PopoverPanel>
        </Popover>
        <Popover>
          <PopoverButton id="second-trigger">Second</PopoverButton>
          <PopoverPanel id="second-panel">Second panel</PopoverPanel>
        </Popover>
      </PopoverGroup>
      <Popover>
        <PopoverButton id="outer-trigger">Outer nested host</PopoverButton>
        <PopoverPanel id="outer-panel">
          <Popover>
            <PopoverButton id="nested-trigger">Nested</PopoverButton>
            <PopoverPanel id="nested-panel">
              <button type="button" id="nested-action">Nested action</button>
            </PopoverPanel>
          </Popover>
        </PopoverPanel>
      </Popover>
    </>
  ));
  await settle();

  await page.getByRole("button", { name: "First" }).click();
  expect(document.getElementById("first-panel")).not.toBeNull();
  page.getByRole("button", { name: "Second" }).element().focus();
  await userEvent.keyboard("{Escape}");
  await settle();
  expect(document.getElementById("first-panel")).toBeNull();

  await page.getByRole("button", { name: "First" }).click();
  await page.getByRole("button", { name: "Second" }).click();
  await settle();
  expect(document.getElementById("first-panel")).toBeNull();
  expect(document.getElementById("second-panel")).not.toBeNull();

  await page.getByRole("button", { name: "Outer nested host", exact: true })
    .click();
  await settle();
  expect(document.getElementById("second-panel")).toBeNull();
  expect(document.getElementById("outer-panel")).not.toBeNull();
  await page.getByRole("button", { name: "Nested", exact: true }).click();
  await settle();
  expect(document.getElementById("outer-panel")).not.toBeNull();
  expect(document.getElementById("nested-panel")).not.toBeNull();
  document.getElementById("nested-action")?.focus();
  await userEvent.keyboard("{Escape}");
  await settle();
  expect(document.getElementById("nested-panel")).toBeNull();
  expect(document.getElementById("outer-panel")).not.toBeNull();
  expect(document.activeElement?.id).toBe("nested-trigger");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("outside focus and clicks close with the upstream focus policy", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <span id="outside-text">Outside text</span>
      <button type="button" id="outside-button">Outside button</button>
      <Popover>
        <PopoverButton id="dismiss-trigger">Dismissible</PopoverButton>
        <PopoverPanel id="dismiss-panel">
          <button type="button" id="panel-action">Panel action</button>
        </PopoverPanel>
      </Popover>
    </>
  ));
  await settle();

  await page.getByRole("button", { name: "Dismissible" }).click();
  document.getElementById("panel-action")?.focus();
  await userEvent.keyboard("{Escape}");
  await settle();
  expect(document.getElementById("dismiss-panel")).toBeNull();
  expect(document.activeElement?.id).toBe("dismiss-trigger");

  await page.getByRole("button", { name: "Dismissible" }).click();
  await page.getByRole("button", { name: "Outside button" }).click();
  await settle();
  expect(document.getElementById("dismiss-panel")).toBeNull();
  expect(document.activeElement?.id).toBe("outside-button");

  await page.getByRole("button", { name: "Dismissible" }).click();
  await page.getByText("Outside text").click();
  await settle();
  expect(document.getElementById("dismiss-panel")).toBeNull();
  expect(document.activeElement?.id).toBe("dismiss-trigger");

  await page.getByRole("button", { name: "Dismissible" }).click();
  document.getElementById("outside-button")?.focus();
  await settle();
  expect(document.getElementById("dismiss-panel")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("render strategies, render props, close targets, and overlay alias stay compatible", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <button id="close-target" type="button">Close target</button>
      <Popover>
        {(root) => (
          <>
            <PopoverButton id="semantic-trigger">
              {root.open ? "Close semantic" : "Open semantic"}
            </PopoverButton>
            <PopoverOverlay id="semantic-overlay" static />
            <PopoverPanel id="semantic-panel">
              {(panel) => (
                <button
                  type="button"
                  onClick={() =>
                    panel.close(document.getElementById("close-target"))}
                >
                  Close from panel
                </button>
              )}
            </PopoverPanel>
          </>
        )}
      </Popover>
      <Popover>
        <PopoverButton>Persistent</PopoverButton>
        <PopoverBackdrop id="persistent-backdrop" unmount={false} />
        <PopoverPanel id="persistent-panel" unmount={false}>
          Retained
        </PopoverPanel>
      </Popover>
      <Popover>
        <PopoverButton>Static</PopoverButton>
        <PopoverPanel id="static-panel" static>Always</PopoverPanel>
      </Popover>
    </>
  ));
  await settle();

  expect(Popover.Overlay).toBe(PopoverOverlay);
  expect(PopoverOverlay).toBe(PopoverBackdrop);
  expect(document.getElementById("semantic-overlay")).not.toBeNull();
  const persistentPanel = document.getElementById("persistent-panel")!;
  expect(persistentPanel.hidden).toBe(true);
  expect(persistentPanel.style.display).toBe("none");
  expect(document.getElementById("persistent-backdrop")?.hidden).toBe(true);
  expect(document.getElementById("static-panel")?.hidden).toBe(false);

  await page.getByRole("button", { name: "Open semantic" }).click();
  await expect.element(page.getByRole("button", { name: "Close semantic" }))
    .toBeVisible();
  await page.getByRole("button", { name: "Close from panel" }).click();
  await settle();
  expect(document.getElementById("semantic-panel")).toBeNull();
  expect(document.activeElement?.id).toBe("close-target");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("portalled focus sentinels preserve logical tab order", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <button id="before-popover" type="button">Before</button>
      <Popover>
        <PopoverButton id="portal-trigger">Portal focus</PopoverButton>
        <PopoverPanel id="portal-panel" portal>
          <a id="portal-first" href="#first">First portal action</a>
          <a id="portal-last" href="#last">Last portal action</a>
        </PopoverPanel>
      </Popover>
      <button id="after-popover" type="button">After</button>
    </>
  ));
  await settle();

  const trigger = page.getByRole("button", { name: "Portal focus" });
  await trigger.click();
  await settle();
  const panel = document.getElementById("portal-panel")!;
  expect(panel.closest("#headlessui-portal-root")).not.toBeNull();
  expect(document.querySelectorAll("[data-headlessui-focus-guard]").length)
    .toBe(3);

  trigger.element().focus();
  await userEvent.keyboard("{Tab}");
  await settle();
  expect(document.activeElement?.id).toBe("portal-first");
  await userEvent.keyboard("{Tab}");
  expect(document.activeElement?.id).toBe("portal-last");
  await userEvent.keyboard("{Tab}");
  await settle();
  expect(document.activeElement?.id).toBe("after-popover");

  document.getElementById("portal-first")?.focus();
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  await settle();
  expect(document.activeElement?.id).toBe("portal-trigger");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("anchor, modal scroll lock, and leave transitions compose", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <style>
        {`
          #anchored-panel {
            --anchor-gap: 8px;
            --anchor-offset: 4px;
            --anchor-padding: 2px;
            width: 120px;
            height: 50px;
            transition-property: opacity;
            transition-duration: 120ms;
          }
          #anchored-panel[data-closed] { opacity: 0; }
        `}
      </style>
      <Popover>
        <PopoverButton
          id="anchor-trigger"
          ref={(element) => {
            element.getBoundingClientRect = () => new DOMRect(100, 100, 80, 30);
          }}
        >
          Anchored popover
        </PopoverButton>
        <PopoverPanel
          id="anchored-panel"
          anchor="bottom end"
          modal
          transition
          ref={(element) => {
            element.getBoundingClientRect = () => new DOMRect(0, 0, 120, 50);
          }}
        >
          <button type="button">Anchored action</button>
        </PopoverPanel>
      </Popover>
    </>
  ));
  await delay(25);

  const trigger = page.getByRole("button", { name: "Anchored popover" });
  await trigger.click();
  await expect.poll(() => document.getElementById("anchored-panel"))
    .not.toBeNull();
  const panel = document.getElementById("anchored-panel")!;
  expect(panel.closest("#headlessui-portal-root")).not.toBeNull();
  await expect.poll(() => panel.hasAttribute("data-enter"), {
    timeout: 2_000,
  }).toBe(true);
  await expect.poll(() => panel.getAttribute("data-anchor")).toBe(
    "bottom end",
  );
  await expect.poll(() => ({
    buttonWidth: panel.style.getPropertyValue("--button-width"),
    left: panel.style.left,
    position: panel.style.position,
    top: panel.style.top,
  })).toEqual({
    buttonWidth: "80px",
    left: "64px",
    position: "absolute",
    top: "138px",
  });
  expect(document.documentElement.style.overflow).toBe("hidden");

  // Complete the enter phase so the close below exercises an ordinary leave,
  // rather than the distinct interrupted-enter reversal path.
  await expect.poll(() => panel.hasAttribute("data-transition"), {
    timeout: 2_000,
  }).toBe(false);

  await trigger.click();
  await expect.poll(() => panel.getAttribute("data-leave")).toBe("");
  expect(document.getElementById("anchored-panel")).not.toBeNull();
  await expect.poll(() => document.getElementById("anchored-panel"), {
    timeout: 2_000,
  }).toBeNull();
  expect(document.documentElement.style.overflow).toBe("");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("an open panel can move into and out of a portal without diagnostics", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let enablePortal = () => {};
  let disablePortal = () => {};

  function Example() {
    const [portalled, setPortalled] = createSignal(false);
    enablePortal = () => setPortalled(true);
    disablePortal = () => setPortalled(false);
    return (
      <Popover>
        <PopoverButton>Dynamic popover portal</PopoverButton>
        <PopoverPanel id="dynamic-popover-panel" portal={portalled()}>
          Dynamic panel
        </PopoverPanel>
      </Popover>
    );
  }

  mount(() => <Example />);
  await settle();
  await page.getByRole("button", { name: "Dynamic popover portal" }).click();
  await settle();
  expect(
    document.getElementById("dynamic-popover-panel")?.closest(
      "#headlessui-portal-root",
    ),
  ).toBeNull();

  enablePortal();
  await settle();
  expect(
    document.getElementById("dynamic-popover-panel")?.closest(
      "#headlessui-portal-root",
    ),
  ).not.toBeNull();

  disablePortal();
  await settle();
  expect(
    document.getElementById("dynamic-popover-panel")?.closest(
      "#headlessui-portal-root",
    ),
  ).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
