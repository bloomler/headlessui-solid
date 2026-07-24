import { renderToString } from "@solidjs/web";
import {
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "../../src/components/tabs/tabs.tsx";

function Example(props: {
  defaultIndex?: number;
  selectedIndex?: number;
  vertical?: boolean;
}) {
  return (
    <TabGroup
      defaultIndex={props.defaultIndex}
      selectedIndex={props.selectedIndex}
      vertical={props.vertical}
      manual
    >
      {(group) => (
        <>
          <output data-selected-index>{group.selectedIndex}</output>
          <TabList id="account-tabs">
            {(list) => (
              <>
                <output data-list-index>{list.selectedIndex}</output>
                <Tab id="profile-tab">
                  {(tab) => tab.selected ? "Selected profile" : "Profile"}
                </Tab>
                <Tab id="security-tab">Security</Tab>
                <Tab id="billing-tab">Billing</Tab>
              </>
            )}
          </TabList>
          <TabPanels id="account-panels">
            <TabPanel id="profile-panel">Profile content</TabPanel>
            <TabPanel id="security-panel">Security content</TabPanel>
            <TabPanel id="billing-panel">Billing content</TabPanel>
          </TabPanels>
        </>
      )}
    </TabGroup>
  );
}

export function renderDefaultTabs(): string {
  return renderToString(() => <Example />);
}

export function renderIndexedTabs(): string {
  return renderToString(() => <Example defaultIndex={1} vertical />);
}

export function renderPanelsFirst(): string {
  return renderToString(() => (
    <TabGroup defaultIndex={1}>
      <TabPanels>
        <TabPanel>First panel-first content</TabPanel>
        <TabPanel>Second panel-first content</TabPanel>
      </TabPanels>
      <TabList>
        <Tab>First panel-first tab</Tab>
        <Tab>Second panel-first tab</Tab>
      </TabList>
    </TabGroup>
  ));
}

export function renderControlledTabs(): string {
  return renderToString(() => <Example selectedIndex={2} />);
}

export function renderStrategies(): string {
  return renderToString(() => (
    <TabGroup defaultIndex={0}>
      <TabList>
        <Tab>First</Tab>
        <Tab>Persistent</Tab>
        <Tab>Static</Tab>
      </TabList>
      <TabPanels>
        <TabPanel id="selected-panel">Selected content</TabPanel>
        <TabPanel id="persistent-panel" unmount={false}>
          Persistent content
        </TabPanel>
        <TabPanel id="static-panel" static>Static content</TabPanel>
      </TabPanels>
    </TabGroup>
  ));
}

export function renderOrphanList(): string {
  return renderToString(() => <TabList />);
}

export function renderOrphanTab(): string {
  return renderToString(() => <Tab />);
}

export function renderOrphanPanels(): string {
  return renderToString(() => <TabPanels />);
}

export function renderOrphanPanel(): string {
  return renderToString(() => <TabPanel />);
}

export function staticsArePreserved(): boolean {
  return Tab.Group === TabGroup && Tab.List === TabList &&
    Tab.Panels === TabPanels && Tab.Panel === TabPanel;
}
