import { type JSX, render } from "@solidjs/web";
import { createSignal, DEV, flush, For } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { Dialog } from "../src/components/dialog/dialog.tsx";
import {
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "../src/components/tabs/tabs.tsx";

function CustomButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement>,
): ReturnType<typeof Tab> {
  return <button {...props} />;
}

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

function mount(children: () => ReturnType<typeof TabGroup>): void {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(children, host);
}

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  host?.remove();
  host = undefined;
  document.getElementById("headlessui-portal-root")?.remove();
  await settle();
});

test("a disabled default advances to the next available tab", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <TabGroup defaultIndex={0}>
      <TabList>
        <Tab id="disabled-default" disabled>Unavailable</Tab>
        <Tab id="available-default">Available</Tab>
      </TabList>
      <TabPanels>
        <TabPanel id="disabled-default-panel">Unavailable panel</TabPanel>
        <TabPanel id="available-default-panel">Available panel</TabPanel>
      </TabPanels>
    </TabGroup>
  ));
  await settle();

  expect(
    document.getElementById("disabled-default")?.getAttribute(
      "aria-selected",
    ),
  ).toBe("false");
  expect(
    document.getElementById("available-default")?.getAttribute(
      "aria-selected",
    ),
  ).toBe("true");
  expect(document.getElementById("available-default-panel")?.tagName).toBe(
    "DIV",
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("controlled insertion keeps the tab and panel at selectedIndex aligned", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let insert = () => {};

  function Example() {
    const [items, setItems] = createSignal(["A", "B", "C"]);
    insert = () =>
      setItems((current) => [current[0], "D", ...current.slice(1)]);

    return (
      <TabGroup selectedIndex={1}>
        <TabList>
          <For each={items()}>
            {(item) => <Tab id={`tab-${item}`}>Tab {item}</Tab>}
          </For>
        </TabList>
        <TabPanels>
          <For each={items()}>
            {(item) => <TabPanel id={`panel-${item}`}>Panel {item}</TabPanel>}
          </For>
        </TabPanels>
      </TabGroup>
    );
  }

  mount(() => <Example />);
  await settle();
  insert();
  await settle();

  expect(document.getElementById("tab-D")?.getAttribute("aria-selected"))
    .toBe("true");
  expect(
    Array.from(host?.querySelectorAll("[role=tabpanel]") ?? []).map((panel) =>
      `${panel.id}:${panel.tagName}:${
        panel.getAttribute("aria-labelledby")
      }:${panel.textContent}`
    ),
  ).toEqual([
    "panel-A:SPAN:tab-A:",
    "panel-D:DIV:tab-D:Panel D",
    "panel-B:SPAN:tab-B:",
    "panel-C:SPAN:tab-C:",
  ]);
  expect(document.getElementById("panel-D")?.tagName).toBe("DIV");
  expect(document.getElementById("panel-D")?.textContent).toBe("Panel D");
  expect(document.getElementById("panel-B")?.tagName).toBe("SPAN");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("a custom button Tab receives the default button type", () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <TabGroup>
      <TabList>
        <Tab as={CustomButton} id="custom-tab">Custom tab</Tab>
      </TabList>
      <TabPanels>
        <TabPanel>Custom panel</TabPanel>
      </TabPanels>
    </TabGroup>
  ));
  expect(document.getElementById("custom-tab")?.getAttribute("type")).toBe(
    "button",
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("automatic selection swaps the tabbable panel around a closed Dialog", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <TabGroup>
      <TabList>
        <Tab id="dialog-tab-one">Tab one</Tab>
        <Tab id="dialog-tab-two">Tab two</Tab>
      </TabList>
      <TabPanels>
        <TabPanel id="dialog-panel-one">Panel one</TabPanel>
        <TabPanel id="dialog-panel-two">
          <button id="dialog-trigger" type="button">Trigger</button>
          <Dialog autofocus={false} open={false} onClose={() => {}} />
        </TabPanel>
      </TabPanels>
    </TabGroup>
  ));
  await settle();

  const first = document.getElementById("dialog-tab-one")!;
  first.focus();
  first.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
  );
  await settle();

  expect(document.activeElement?.id).toBe("dialog-tab-two");
  expect(
    document.getElementById("dialog-tab-two")?.getAttribute("aria-selected"),
  ).toBe("true");
  expect(document.getElementById("dialog-panel-one")?.tagName).toBe("SPAN");
  expect(document.getElementById("dialog-panel-one")?.getAttribute("tabindex"))
    .toBe("-1");
  expect(document.getElementById("dialog-panel-two")?.tagName).toBe("DIV");
  expect(document.getElementById("dialog-panel-two")?.getAttribute("tabindex"))
    .toBe("0");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
