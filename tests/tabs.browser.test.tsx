import { type JSX, render } from "@solidjs/web";
import { createSignal, DEV, flush, For, Show } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "../src/components/tabs/tabs.tsx";
import { Dialog } from "../src/components/dialog/dialog.tsx";

function TabForwardButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement>,
): ReturnType<typeof Tab> {
  return <button {...props} />;
}

function TabForwardDiv(
  props: JSX.HTMLAttributes<HTMLDivElement>,
): ReturnType<typeof Tab> {
  return <div {...props} />;
}

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  flush();
}

function mount(children: () => ReturnType<typeof TabGroup>): void {
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

test("Tabs auto activation wraps and skips disabled tabs", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const changes: number[] = [];

  mount(() => (
    <TabGroup onChange={(index) => changes.push(index)}>
      <TabList>
        <Tab id="auto-alpha">Alpha</Tab>
        <Tab id="auto-beta" disabled>Beta</Tab>
        <Tab id="auto-gamma">Gamma</Tab>
      </TabList>
      <TabPanels>
        <TabPanel id="auto-alpha-panel">Alpha panel</TabPanel>
        <TabPanel id="auto-beta-panel">Beta panel</TabPanel>
        <TabPanel id="auto-gamma-panel">Gamma panel</TabPanel>
      </TabPanels>
    </TabGroup>
  ));
  await settle();

  const alpha = page.getByRole("tab", { name: "Alpha" });
  const beta = page.getByRole("tab", { name: "Beta" });
  const gamma = page.getByRole("tab", { name: "Gamma" });
  await expect.element(alpha).toHaveAttribute("aria-selected", "true");
  await expect.element(alpha).toHaveAttribute(
    "aria-controls",
    "auto-alpha-panel",
  );
  await expect.element(beta).toBeDisabled();
  expect(
    document.getElementById("auto-alpha-panel")?.getAttribute(
      "aria-labelledby",
    ),
  ).toBe("auto-alpha");

  (beta.element() as HTMLButtonElement).click();
  await settle();
  await expect.element(alpha).toHaveAttribute("aria-selected", "true");

  alpha.element().focus();
  await userEvent.keyboard("{ArrowRight}");
  await settle();
  expect(document.activeElement?.id).toBe("auto-gamma");
  await expect.element(gamma).toHaveAttribute("aria-selected", "true");

  await userEvent.keyboard("{ArrowRight}");
  await settle();
  expect(document.activeElement?.id).toBe("auto-alpha");
  await expect.element(alpha).toHaveAttribute("aria-selected", "true");

  await userEvent.keyboard("{End}");
  await settle();
  await expect.element(gamma).toHaveAttribute("aria-selected", "true");
  await userEvent.keyboard("{Home}");
  await settle();
  await expect.element(alpha).toHaveAttribute("aria-selected", "true");
  expect(changes).toEqual([2, 0, 2, 0]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("manual vertical Tabs move focus without selecting until activation", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <TabGroup vertical manual>
      <TabList id="manual-list">
        <Tab id="manual-alpha">Alpha manual</Tab>
        <Tab id="manual-beta" disabled>Beta manual</Tab>
        <Tab id="manual-gamma">Gamma manual</Tab>
      </TabList>
      <TabPanels>
        <TabPanel>Alpha manual panel</TabPanel>
        <TabPanel>Beta manual panel</TabPanel>
        <TabPanel>Gamma manual panel</TabPanel>
      </TabPanels>
    </TabGroup>
  ));
  await settle();

  const alpha = page.getByRole("tab", { name: "Alpha manual" });
  const gamma = page.getByRole("tab", { name: "Gamma manual" });
  await expect.element(page.getByRole("tablist")).toHaveAttribute(
    "aria-orientation",
    "vertical",
  );

  alpha.element().focus();
  await userEvent.keyboard("{ArrowDown}");
  await settle();
  expect(document.activeElement?.id).toBe("manual-gamma");
  await expect.element(alpha).toHaveAttribute("aria-selected", "true");
  await expect.element(gamma).toHaveAttribute("aria-selected", "false");

  await userEvent.keyboard("{ArrowRight}");
  await settle();
  expect(document.activeElement?.id).toBe("manual-gamma");
  await userEvent.keyboard("{Enter}");
  await settle();
  await expect.element(gamma).toHaveAttribute("aria-selected", "true");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("controlled Tabs retain authority and defaultIndex is read once", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let updateDefault = (_index: number) => {};
  let updateControlled = (_index: number) => {};

  function Example() {
    const [defaultIndex, setDefaultIndex] = createSignal(1);
    const [controlledIndex, setControlledIndex] = createSignal(1);
    const [requestedIndex, setRequestedIndex] = createSignal(-1);
    updateDefault = setDefaultIndex;
    updateControlled = setControlledIndex;

    return (
      <>
        <TabGroup defaultIndex={defaultIndex()}>
          <TabList>
            <Tab>Default one</Tab>
            <Tab>Default two</Tab>
            <Tab>Default three</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>Default panel one</TabPanel>
            <TabPanel>Default panel two</TabPanel>
            <TabPanel>Default panel three</TabPanel>
          </TabPanels>
        </TabGroup>
        <TabGroup
          selectedIndex={controlledIndex()}
          onChange={setRequestedIndex}
        >
          <TabList>
            <Tab>Controlled one</Tab>
            <Tab>Controlled two</Tab>
            <Tab>Controlled three</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>Controlled panel one</TabPanel>
            <TabPanel>Controlled panel two</TabPanel>
            <TabPanel>Controlled panel three</TabPanel>
          </TabPanels>
        </TabGroup>
        <TabGroup defaultIndex={0}>
          <TabList>
            <Tab disabled>Unavailable default</Tab>
            <Tab>Available default</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>Unavailable default panel</TabPanel>
            <TabPanel>Available default panel</TabPanel>
          </TabPanels>
        </TabGroup>
        <output aria-label="requested controlled index">
          {requestedIndex()}
        </output>
      </>
    );
  }

  mount(() => <Example />);
  await settle();
  await expect.element(page.getByRole("tab", { name: "Default two" }))
    .toHaveAttribute("aria-selected", "true");
  await expect.element(
    page.getByRole("tab", { name: "Available default", exact: true }),
  )
    .toHaveAttribute("aria-selected", "true");
  updateDefault(0);
  await settle();
  await expect.element(page.getByRole("tab", { name: "Default two" }))
    .toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "Controlled three" }).click();
  await settle();
  await expect.element(page.getByRole("tab", { name: "Controlled two" }))
    .toHaveAttribute("aria-selected", "true");
  await expect.element(page.getByLabelText("requested controlled index"))
    .toHaveTextContent("2");
  updateControlled(2);
  await settle();
  await expect.element(page.getByRole("tab", { name: "Controlled three" }))
    .toHaveAttribute("aria-selected", "true");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("uncontrolled Tabs preserve selected identity across reorder and insertion", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const alpha = { id: "alpha", label: "Alpha dynamic" };
  const beta = { id: "beta", label: "Beta dynamic" };
  const gamma = { id: "gamma", label: "Gamma dynamic" };
  let reverse = () => {};
  let prepend = () => {};

  function Example() {
    const [items, setItems] = createSignal([alpha, beta, gamma]);
    reverse = () => setItems((current) => current.slice().reverse());
    prepend = () =>
      setItems((current) => [
        { id: "delta", label: "Delta dynamic" },
        ...current,
      ]);

    return (
      <TabGroup>
        {(slot) => (
          <>
            <output aria-label="dynamic selected index">
              {slot.selectedIndex}
            </output>
            <TabList>
              <For each={items()}>
                {(item) => <Tab id={`dynamic-${item.id}`}>{item.label}</Tab>}
              </For>
            </TabList>
            <TabPanels>
              <For each={items()}>
                {(item) => <TabPanel>{item.label} panel</TabPanel>}
              </For>
            </TabPanels>
          </>
        )}
      </TabGroup>
    );
  }

  mount(() => <Example />);
  await settle();
  const alphaTab = page.getByRole("tab", { name: "Alpha dynamic" });
  await alphaTab.click();
  await settle();

  reverse();
  await settle();
  await expect.element(alphaTab).toHaveAttribute("aria-selected", "true");
  await expect.element(page.getByLabelText("dynamic selected index"))
    .toHaveTextContent("2");

  prepend();
  await settle();
  await expect.element(alphaTab).toHaveAttribute("aria-selected", "true");
  await expect.element(page.getByLabelText("dynamic selected index"))
    .toHaveTextContent("3");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("TabPanel render strategies preserve placeholder, hidden, and static contracts", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <TabGroup>
      <TabList>
        <Tab>Selected strategy</Tab>
        <Tab>Persistent strategy</Tab>
        <Tab>Static strategy</Tab>
        <Tab>Unmounted strategy</Tab>
      </TabList>
      <TabPanels>
        <TabPanel id="strategy-selected">Selected body</TabPanel>
        <TabPanel id="strategy-persistent" unmount={false}>
          Persistent body
        </TabPanel>
        <TabPanel id="strategy-static" static>Static body</TabPanel>
        <TabPanel id="strategy-unmounted">Unmounted body</TabPanel>
      </TabPanels>
    </TabGroup>
  ));
  await settle();

  const persistent = document.getElementById("strategy-persistent")!;
  const staticPanel = document.getElementById("strategy-static")!;
  const placeholder = document.getElementById("strategy-unmounted")!;
  expect(persistent.hidden).toBe(true);
  expect(persistent.style.display).toBe("none");
  expect(staticPanel.hidden).toBe(false);
  expect(staticPanel.style.display).toBe("");
  expect(placeholder.tagName).toBe("SPAN");
  expect(placeholder.getAttribute("aria-hidden")).toBe("true");
  expect(host?.textContent).not.toContain("Unmounted body");

  await page.getByRole("tab", { name: "Unmounted strategy" }).click();
  await settle();
  const selected = document.getElementById("strategy-unmounted")!;
  expect(selected.tagName).toBe("DIV");
  expect(selected.textContent).toContain("Unmounted body");
  expect(document.getElementById("strategy-selected")?.tagName).toBe("SPAN");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Tabs cover the complete auto and manual keyboard alias matrix", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <TabGroup>
        <TabList>
          <Tab id="matrix-auto-alpha">Auto alpha</Tab>
          <Tab id="matrix-auto-disabled" disabled>Auto disabled</Tab>
          <Tab id="matrix-auto-gamma">Auto gamma</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>Auto alpha panel</TabPanel>
          <TabPanel>Auto disabled panel</TabPanel>
          <TabPanel>Auto gamma panel</TabPanel>
        </TabPanels>
      </TabGroup>
      <TabGroup vertical manual>
        <TabList>
          <Tab id="matrix-manual-alpha">Manual alpha</Tab>
          <Tab id="matrix-manual-disabled" disabled>Manual disabled</Tab>
          <Tab id="matrix-manual-gamma">Manual gamma</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>Manual alpha panel</TabPanel>
          <TabPanel>Manual disabled panel</TabPanel>
          <TabPanel>Manual gamma panel</TabPanel>
        </TabPanels>
      </TabGroup>
    </>
  ));
  await settle();

  const autoAlpha = page.getByRole("tab", { name: "Auto alpha" });
  const autoGamma = page.getByRole("tab", { name: "Auto gamma" });
  autoAlpha.element().focus();
  await userEvent.keyboard("{ArrowLeft}");
  await settle();
  expect(document.activeElement?.id).toBe("matrix-auto-gamma");
  await expect.element(autoGamma).toHaveAttribute("aria-selected", "true");
  await userEvent.keyboard("{PageUp}");
  await settle();
  await expect.element(autoAlpha).toHaveAttribute("aria-selected", "true");
  await userEvent.keyboard("{PageDown}");
  await settle();
  await expect.element(autoGamma).toHaveAttribute("aria-selected", "true");
  await userEvent.keyboard("{ArrowDown}");
  expect(document.activeElement?.id).toBe("matrix-auto-gamma");

  const manualAlpha = page.getByRole("tab", { name: "Manual alpha" });
  const manualGamma = page.getByRole("tab", { name: "Manual gamma" });
  manualAlpha.element().focus();
  await userEvent.keyboard("{ArrowUp}");
  await settle();
  expect(document.activeElement?.id).toBe("matrix-manual-gamma");
  await expect.element(manualAlpha).toHaveAttribute("aria-selected", "true");
  await expect.element(manualGamma).toHaveAttribute("aria-selected", "false");
  await userEvent.keyboard(" ");
  await settle();
  await expect.element(manualGamma).toHaveAttribute("aria-selected", "true");
  await userEvent.keyboard("{ArrowLeft}");
  expect(document.activeElement?.id).toBe("matrix-manual-gamma");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Tabs render props, polymorphism, button types, and delayed registration preserve contracts", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let reveal = () => {};

  function DelayedTabs() {
    const [visible, setVisible] = createSignal(false);
    reveal = () => setVisible(true);
    return (
      <TabGroup defaultIndex={1}>
        <TabList>
          <Show when={visible()}>
            <Tab id="delayed-alpha">Delayed alpha</Tab>
            <Tab id="delayed-beta">Delayed beta</Tab>
          </Show>
        </TabList>
        <TabPanels>
          <Show when={visible()}>
            <TabPanel>Delayed alpha panel</TabPanel>
            <TabPanel>Delayed beta panel</TabPanel>
          </Show>
        </TabPanels>
      </TabGroup>
    );
  }

  mount(() => (
    <>
      <TabGroup as="section" id="contract-tabs" defaultIndex={1}>
        {(group) => (
          <>
            <output id="contract-group-index">{group.selectedIndex}</output>
            <TabList as="nav" id="contract-tablist">
              {(list) => (
                <>
                  <output id="contract-list-index">{list.selectedIndex}</output>
                  <Tab
                    id="contract-tab-alpha"
                    class={(slot) =>
                      slot.selected ? "selected-tab" : "idle-tab"}
                  >
                    Contract alpha
                  </Tab>
                  <Tab id="contract-tab-beta" type="submit">Contract beta</Tab>
                  <Tab as="div" id="contract-tab-gamma">Contract gamma</Tab>
                </>
              )}
            </TabList>
            <TabPanels as="main" id="contract-panels">
              {(panels) => (
                <>
                  <output id="contract-panels-index">
                    {panels.selectedIndex}
                  </output>
                  <TabPanel as="article">Contract alpha panel</TabPanel>
                  <TabPanel as="article" id="contract-beta-panel">
                    {(panel) =>
                      panel.selected
                        ? "Contract beta selected"
                        : "Contract beta idle"}
                  </TabPanel>
                  <TabPanel as="article">Contract gamma panel</TabPanel>
                </>
              )}
            </TabPanels>
          </>
        )}
      </TabGroup>
      <DelayedTabs />
    </>
  ));
  await settle();

  expect(document.getElementById("contract-tabs")?.tagName).toBe("SECTION");
  expect(document.getElementById("contract-tablist")?.tagName).toBe("NAV");
  expect(document.getElementById("contract-panels")?.tagName).toBe("MAIN");
  expect(document.getElementById("contract-tab-alpha")?.getAttribute("type"))
    .toBe("button");
  expect(document.getElementById("contract-tab-beta")?.getAttribute("type"))
    .toBe("submit");
  expect(document.getElementById("contract-tab-gamma")?.tagName).toBe("DIV");
  expect(document.getElementById("contract-beta-panel")?.tagName).toBe(
    "ARTICLE",
  );
  expect(document.getElementById("contract-group-index")?.textContent).toBe(
    "1",
  );
  expect(document.getElementById("contract-list-index")?.textContent).toBe("1");
  expect(document.getElementById("contract-panels-index")?.textContent).toBe(
    "1",
  );
  expect(document.body.textContent).toContain("Contract beta selected");
  expect(page.getByRole("tab", { name: "Delayed alpha" }).query()).toBeNull();

  reveal();
  await settle();
  await expect.element(page.getByRole("tab", { name: "Delayed beta" }))
    .toHaveAttribute("aria-selected", "true");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should use the `selectedIndex` when injecting new tabs dynamically", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let insert = () => {};

  function ControlledInjection() {
    const [items, setItems] = createSignal(["A", "B", "C"]);
    insert = () =>
      setItems((current) => [current[0], "D", ...current.slice(1)]);
    return (
      <TabGroup selectedIndex={1}>
        <TabList>
          <For each={items()}>{(item) => <Tab>Injected tab {item}</Tab>}</For>
        </TabList>
        <TabPanels>
          <For each={items()}>
            {(item) => <TabPanel>Injected panel {item}</TabPanel>}
          </For>
        </TabPanels>
      </TabGroup>
    );
  }

  mount(() => <ControlledInjection />);
  await settle();
  await expect.element(page.getByRole("tab", { name: "Injected tab B" }))
    .toHaveAttribute("aria-selected", "true");
  insert();
  await settle();
  await expect.element(page.getByRole("tab", { name: "Injected tab D" }))
    .toHaveAttribute("aria-selected", "true");
  expect(document.body.textContent).toContain("Injected panel D");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should guarantee DOM order after reversing controlled tabs and panels", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let reverse = () => {};

  function ControlledReverse() {
    const [items, setItems] = createSignal([0, 1, 2]);
    const [selected, setSelected] = createSignal(1);
    reverse = () => setItems((current) => current.slice().reverse());
    return (
      <>
        <TabGroup selectedIndex={selected()} onChange={setSelected}>
          <TabList>
            <For each={items()}>
              {(item) => <Tab>Controlled reverse {item}</Tab>}
            </For>
          </TabList>
          <TabPanels>
            <For each={items()}>
              {(item) => <TabPanel>Controlled reverse panel {item}</TabPanel>}
            </For>
          </TabPanels>
        </TabGroup>
        <output id="controlled-reverse-index">{selected()}</output>
      </>
    );
  }

  mount(() => <ControlledReverse />);
  await settle();
  reverse();
  await settle();
  await page.getByRole("tab", { name: "Controlled reverse 0" }).click();
  await settle();
  expect(document.getElementById("controlled-reverse-index")?.textContent).toBe(
    "2",
  );
  await expect.element(page.getByRole("tab", { name: "Controlled reverse 0" }))
    .toHaveAttribute("aria-selected", "true");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should select first tab if no tabs were provided originally", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let reveal = () => {};

  function InitiallyEmpty() {
    const [visible, setVisible] = createSignal(false);
    reveal = () => setVisible(true);
    return (
      <TabGroup defaultIndex={0}>
        <TabList>
          <Show when={visible()}>
            <Tab>Initially empty zero A</Tab>
            <Tab>Initially empty zero B</Tab>
          </Show>
        </TabList>
        <TabPanels>
          <Show when={visible()}>
            <TabPanel>Initially empty zero panel A</TabPanel>
            <TabPanel>Initially empty zero panel B</TabPanel>
          </Show>
        </TabPanels>
      </TabGroup>
    );
  }

  mount(() => <InitiallyEmpty />);
  await settle();
  expect(page.getByRole("tab", { name: "Initially empty zero A" }).query())
    .toBeNull();
  reveal();
  await settle();
  await expect.element(
    page.getByRole("tab", { name: "Initially empty zero A" }),
  )
    .toHaveAttribute("aria-selected", "true");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should select first tab if no tabs were provided originally (with a defaultIndex of 1)", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let reveal = () => {};

  function InitiallyEmptyIndexed() {
    const [visible, setVisible] = createSignal(false);
    reveal = () => setVisible(true);
    return (
      <TabGroup defaultIndex={1}>
        <TabList>
          <Show when={visible()}>
            <Tab>Initially empty indexed A</Tab>
            <Tab>Initially empty indexed B</Tab>
          </Show>
        </TabList>
        <TabPanels>
          <Show when={visible()}>
            <TabPanel>Initially empty indexed panel A</TabPanel>
            <TabPanel>Initially empty indexed panel B</TabPanel>
          </Show>
        </TabPanels>
      </TabGroup>
    );
  }

  mount(() => <InitiallyEmptyIndexed />);
  await settle();
  reveal();
  await settle();
  await expect.element(
    page.getByRole("tab", { name: "Initially empty indexed B" }),
  )
    .toHaveAttribute("aria-selected", "true");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should restore defaultIndex after tabs are removed and re-added", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let reveal = () => {};
  let hide = () => {};

  function CycledTabs() {
    const [visible, setVisible] = createSignal(false);
    reveal = () => setVisible(true);
    hide = () => setVisible(false);
    return (
      <TabGroup defaultIndex={1}>
        <TabList>
          <Show when={visible()}>
            <Tab>Cycled tab A</Tab>
            <Tab>Cycled tab B</Tab>
          </Show>
        </TabList>
        <TabPanels>
          <Show when={visible()}>
            <TabPanel>Cycled panel A</TabPanel>
            <TabPanel>Cycled panel B</TabPanel>
          </Show>
        </TabPanels>
      </TabGroup>
    );
  }

  mount(() => <CycledTabs />);
  await settle();
  reveal();
  await settle();
  hide();
  await settle();
  reveal();
  await settle();
  await expect.element(page.getByRole("tab", { name: "Cycled tab B" }))
    .toHaveAttribute("aria-selected", "true");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test('should set the `type` to "button" when Tab `as` resolves to a "button"', () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <TabGroup>
      <TabList>
        <Tab as={TabForwardButton} id="tab-custom-button">
          Custom tab button
        </Tab>
      </TabList>
      <TabPanels>
        <TabPanel>Custom tab panel</TabPanel>
      </TabPanels>
    </TabGroup>
  ));
  expect(document.getElementById("tab-custom-button")?.getAttribute("type"))
    .toBe("button");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test('should not set the `type` to "button" when Tab `as` resolves to a "div"', () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <TabGroup>
      <TabList>
        <Tab as={TabForwardDiv} id="tab-custom-div">Custom tab div</Tab>
      </TabList>
      <TabPanels>
        <TabPanel>Custom div panel</TabPanel>
      </TabPanels>
    </TabGroup>
  ));
  expect(document.getElementById("tab-custom-div")?.tagName).toBe("DIV");
  expect(document.getElementById("tab-custom-div")?.hasAttribute("type"))
    .toBe(false);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to render Tab using as={Fragment} [Solid explicit-target adaptation]", () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <TabGroup>
      <TabList>
        <Tab as={TabForwardButton} id="tab-fragment-adapter-one">
          Adapted Fragment tab one
        </Tab>
        <Tab>Adapted ordinary tab</Tab>
      </TabList>
      <TabPanels>
        <TabPanel>Adapted Fragment panel one</TabPanel>
        <TabPanel>Adapted ordinary panel</TabPanel>
      </TabPanels>
    </TabGroup>
  ));
  expect(document.getElementById("tab-fragment-adapter-one")?.tagName).toBe(
    "BUTTON",
  );
  expect(document.querySelectorAll("[role=tab]").length).toBe(2);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to render multiple Tab as={Fragment} [Solid explicit-target adaptation]", () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <TabGroup>
      <TabList>
        <Tab as={TabForwardButton} id="tab-fragment-adapter-a">Adapted A</Tab>
        <Tab as={TabForwardButton} id="tab-fragment-adapter-b">Adapted B</Tab>
      </TabList>
      <TabPanels>
        <TabPanel>Adapted panel A</TabPanel>
        <TabPanel>Adapted panel B</TabPanel>
      </TabPanels>
    </TabGroup>
  ));
  expect(document.getElementById("tab-fragment-adapter-a")?.tagName).toBe(
    "BUTTON",
  );
  expect(document.getElementById("tab-fragment-adapter-b")?.tagName).toBe(
    "BUTTON",
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to go to the next item containing a Dialog component", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <TabGroup>
      <TabList>
        <Tab id="dialog-tab-one">Dialog tab one</Tab>
        <Tab id="dialog-tab-two">Dialog tab two</Tab>
        <Tab id="dialog-tab-three">Dialog tab three</Tab>
      </TabList>
      <TabPanels>
        <TabPanel id="dialog-panel-one">Dialog content one</TabPanel>
        <TabPanel id="dialog-panel-two">
          <button id="closed-dialog-trigger" type="button">
            Closed dialog trigger
          </button>
          <Dialog autofocus={false} open={false} onClose={() => {}} />
        </TabPanel>
        <TabPanel id="dialog-panel-three">Dialog content three</TabPanel>
      </TabPanels>
    </TabGroup>
  ));
  await settle();

  expect(document.activeElement).toBe(document.body);
  await userEvent.keyboard("{Tab}");
  expect(document.activeElement?.id).toBe("dialog-tab-one");
  await userEvent.keyboard("{ArrowRight}");
  await settle();
  expect(document.activeElement?.id).toBe("dialog-tab-two");
  await userEvent.keyboard("{Tab}");
  expect(document.activeElement?.id).toBe("dialog-panel-two");
  await userEvent.keyboard("{Tab}");
  expect(document.activeElement?.id).toBe("closed-dialog-trigger");
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  expect(document.activeElement?.id).toBe("dialog-panel-two");
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  expect(document.activeElement?.id).toBe("dialog-tab-two");
  await userEvent.keyboard("{ArrowRight}");
  await settle();
  expect(document.activeElement?.id).toBe("dialog-tab-three");
  await userEvent.keyboard("{Tab}");
  expect(document.activeElement?.id).toBe("dialog-panel-three");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
