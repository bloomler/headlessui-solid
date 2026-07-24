import { hydrate, renderToString } from "@solidjs/web";
import type { Element } from "solid-js";
import {
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "../../src/components/tabs/tabs.tsx";
import {
  assertSolidDiagnosticsCapture,
  captureSolidDiagnostics,
} from "./solid-diagnostics.ts";

export type TabsHydrationVariant =
  | "default"
  | "default-0"
  | "default-1"
  | "selected-0"
  | "selected-1";

interface FixtureProps {
  variant: TabsHydrationVariant;
}

function groupProps(variant: TabsHydrationVariant): {
  defaultIndex?: number;
  selectedIndex?: number;
} {
  switch (variant) {
    case "default":
      return {};
    case "default-0":
      return { defaultIndex: 0 };
    case "default-1":
      return { defaultIndex: 1 };
    case "selected-0":
      return { selectedIndex: 0 };
    case "selected-1":
      return { selectedIndex: 1 };
  }
}

function TabsHydrationFixture(props: FixtureProps): Element {
  return (
    <main id="tabs-hydration-shell" data-variant={props.variant}>
      <TabGroup {...groupProps(props.variant)}>
        {(slot) => (
          <>
            <output id="tabs-hydration-index">{slot.selectedIndex}</output>
            <TabList id="tabs-hydration-list">
              <Tab id="tabs-hydration-tab-0">Hydration tab 1</Tab>
              <Tab id="tabs-hydration-tab-1">Hydration tab 2</Tab>
              <Tab id="tabs-hydration-tab-2">Hydration tab 3</Tab>
            </TabList>
            <TabPanels id="tabs-hydration-panels">
              <TabPanel id="tabs-hydration-panel-0">
                Hydration content 1
              </TabPanel>
              <TabPanel id="tabs-hydration-panel-1">
                Hydration content 2
              </TabPanel>
              <TabPanel id="tabs-hydration-panel-2">
                Hydration content 3
              </TabPanel>
            </TabPanels>
          </>
        )}
      </TabGroup>
    </main>
  );
}

export function renderTabsHydrationFixture(
  variant: TabsHydrationVariant,
): string {
  return renderToString(() => <TabsHydrationFixture variant={variant} />);
}

export function assertTabsDiagnosticCapture(): void {
  assertSolidDiagnosticsCapture();
}

export function hydrateTabsFixture(
  element: HTMLElement,
  variant: TabsHydrationVariant,
): {
  diagnosticDetails(): string[];
  dispose(): void;
} {
  const diagnostics = captureSolidDiagnostics();
  const dispose = hydrate(
    () => <TabsHydrationFixture variant={variant} />,
    element,
  );
  return {
    diagnosticDetails: diagnostics.stop,
    dispose,
  };
}
