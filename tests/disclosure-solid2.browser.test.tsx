import { render } from "@solidjs/web";
import { createSignal, DEV, flush } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
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

function createHost(): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  return host;
}

test("Disclosure toggles with native pointer and keyboard events", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let updateInitial = (_value: boolean) => {};

  function Example() {
    const [initial, setInitial] = createSignal(false);
    updateInitial = setInitial;

    return (
      <Disclosure defaultOpen={initial()}>
        <DisclosureButton id="browser-trigger">
          {(slot) => slot.open ? "Hide details" : "Show details"}
        </DisclosureButton>
        <DisclosurePanel id="browser-panel">Details</DisclosurePanel>
      </Disclosure>
    );
  }

  dispose = render(() => <Example />, createHost());
  const closed = page.getByRole("button", { name: "Show details" });
  await expect.element(closed).toHaveAttribute("aria-expanded", "false");

  updateInitial(true);
  flush();
  await expect.element(closed).toHaveAttribute("aria-expanded", "false");

  await closed.click();
  flush();
  const open = page.getByRole("button", { name: "Hide details" });
  await expect.element(open).toHaveAttribute("aria-expanded", "true");
  await expect.element(open).toHaveAttribute("aria-controls", "browser-panel");
  await expect.element(page.getByText("Details", { exact: true }))
    .toBeVisible();

  const trigger = document.getElementById("browser-trigger")!;
  const enter = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "Enter",
  });
  trigger.dispatchEvent(enter);
  flush();
  expect(enter.defaultPrevented).toBe(true);
  await expect.element(page.getByRole("button", { name: "Show details" }))
    .toHaveAttribute("aria-expanded", "false");

  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("nested buttons and close restore focus", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let restore: HTMLButtonElement | undefined;

  dispose = render(
    () => (
      <>
        <button type="button" ref={(element) => restore = element}>
          Restore target
        </button>
        <Disclosure defaultOpen>
          {(slot) => (
            <>
              <DisclosureButton id="browser-primary">Open</DisclosureButton>
              <DisclosurePanel id="browser-nested-panel">
                <DisclosureButton id="ignored-browser-close">
                  Close nested
                </DisclosureButton>
                <button
                  id="browser-close-api"
                  type="button"
                  onClick={() => slot.close(() => restore)}
                >
                  Close to target
                </button>
              </DisclosurePanel>
            </>
          )}
        </Disclosure>
      </>
    ),
    createHost(),
  );

  const nested = page.getByRole("button", { name: "Close nested" });
  await expect.element(nested).not.toHaveAttribute("id");
  await expect.element(nested).not.toHaveAttribute("aria-expanded");
  await nested.click();
  flush();
  expect(document.activeElement?.id).toBe("browser-primary");
  expect(document.getElementById("browser-nested-panel")).toBeNull();

  await page.getByRole("button", { name: "Open" }).click();
  flush();
  await page.getByRole("button", { name: "Close to target" }).click();
  flush();
  expect(document.activeElement).toBe(restore);
  expect(document.getElementById("browser-nested-panel")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("static and hidden render strategies retain distinct DOM contracts", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  dispose = render(
    () => (
      <>
        <Disclosure>
          <DisclosureButton id="browser-static-trigger">
            Static
          </DisclosureButton>
          <DisclosurePanel id="browser-static-panel" static>
            Always present
          </DisclosurePanel>
        </Disclosure>
        <Disclosure>
          <DisclosureButton id="browser-persistent-trigger">
            Persistent
          </DisclosureButton>
          <DisclosurePanel id="browser-persistent-panel" unmount={false}>
            Kept mounted
          </DisclosurePanel>
        </Disclosure>
        <Disclosure>
          <DisclosureButton id="browser-disabled" disabled>
            Disabled
          </DisclosureButton>
          <DisclosurePanel id="browser-disabled-panel">
            Never shown
          </DisclosurePanel>
        </Disclosure>
      </>
    ),
    createHost(),
  );

  const staticPanel = document.getElementById("browser-static-panel")!;
  expect(staticPanel.hidden).toBe(false);
  expect(staticPanel.style.display).toBe("");

  const persistent = document.getElementById("browser-persistent-panel")!;
  expect(persistent.hidden).toBe(true);
  expect(persistent.style.display).toBe("none");
  await page.getByRole("button", { name: "Persistent" }).click();
  flush();
  expect(persistent.hidden).toBe(false);
  expect(persistent.style.display).toBe("");

  await page.getByRole("button", { name: "Disabled" }).click({ force: true });
  flush();
  expect(document.getElementById("browser-disabled-panel")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
