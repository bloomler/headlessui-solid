import { render } from "@solidjs/web";
import { DEV, type Element, flush } from "solid-js";
import { afterEach, expect, test } from "vitest";
import {
  CloseButton,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  useClose,
} from "../src/index.ts";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

async function settle(): Promise<void> {
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

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  await settle();
  host?.remove();
  host = undefined;
  document.body.replaceChildren();
});

test("CloseButton is a composable native button outside a close provider", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const targets: HTMLButtonElement[] = [];
  const root = mount(() => (
    <CloseButton
      id="standalone-close"
      class={(slot) => ({ idle: !slot.active })}
      onClick={(event) => targets.push(event.currentTarget)}
    >
      Close
    </CloseButton>
  ));

  const button = root.querySelector<HTMLButtonElement>("#standalone-close")!;
  expect(button.type).toBe("button");
  expect(button.classList.contains("idle")).toBe(true);
  button.click();
  await settle();

  expect(targets).toEqual([button]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("CloseButton and useClose dismiss the nearest Disclosure and restore focus", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let consumerClicks = 0;

  function HookCloseButton() {
    const close = useClose();
    return (
      <button id="hook-close" type="button" onClick={close}>Hook close</button>
    );
  }

  const root = mount(() => (
    <Disclosure defaultOpen>
      <DisclosureButton id="disclosure-trigger">Toggle</DisclosureButton>
      <DisclosurePanel id="disclosure-panel">
        <CloseButton
          id="component-close"
          onClick={() => consumerClicks++}
        >
          Component close
        </CloseButton>
        <HookCloseButton />
      </DisclosurePanel>
    </Disclosure>
  ));

  const trigger = root.querySelector<HTMLButtonElement>(
    "#disclosure-trigger",
  )!;
  root.querySelector<HTMLButtonElement>("#component-close")!.click();
  await settle();
  expect(consumerClicks).toBe(1);
  expect(root.querySelector("#disclosure-panel")).toBeNull();
  expect(document.activeElement).toBe(trigger);

  trigger.click();
  await settle();
  root.querySelector<HTMLButtonElement>("#hook-close")!.click();
  await settle();
  expect(root.querySelector("#disclosure-panel")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("nested close providers do not dismiss an outer Disclosure", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const root = mount(() => (
    <Disclosure defaultOpen>
      <DisclosureButton id="outer-trigger">Outer</DisclosureButton>
      <DisclosurePanel id="outer-panel">
        <Disclosure defaultOpen>
          <DisclosureButton id="inner-trigger">Inner</DisclosureButton>
          <DisclosurePanel id="inner-panel">
            <CloseButton id="nearest-close">Close nearest</CloseButton>
          </DisclosurePanel>
        </Disclosure>
      </DisclosurePanel>
    </Disclosure>
  ));

  root.querySelector<HTMLButtonElement>("#nearest-close")!.click();
  await settle();

  expect(root.querySelector("#inner-panel")).toBeNull();
  expect(root.querySelector("#outer-panel")).not.toBeNull();
  expect(document.activeElement?.id).toBe("inner-trigger");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
