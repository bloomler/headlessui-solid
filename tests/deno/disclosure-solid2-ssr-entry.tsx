import { renderToString } from "@solidjs/web";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "../../src/components/disclosure/disclosure.tsx";

export function renderClosedDisclosure(): string {
  return renderToString(() => (
    <Disclosure>
      {(slot) => (
        <>
          <span data-root-state={slot.open ? "open" : "closed"} />
          <DisclosureButton id="account-trigger">
            {(button) => button.open ? "Hide account" : "Show account"}
          </DisclosureButton>
          <DisclosurePanel id="account-panel">Account details</DisclosurePanel>
        </>
      )}
    </Disclosure>
  ));
}

export function renderOpenDisclosure(): string {
  return renderToString(() => (
    <Disclosure defaultOpen>
      {(slot) => (
        <>
          <DisclosureButton id="open-trigger">
            {slot.open ? "Hide" : "Show"}
          </DisclosureButton>
          <DisclosurePanel id="open-panel">
            {(panel) => panel.open ? "Open contents" : "Closed contents"}
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  ));
}

export function renderStaticDisclosure(): string {
  return renderToString(() => (
    <Disclosure>
      <DisclosureButton id="static-trigger">Toggle</DisclosureButton>
      <DisclosurePanel id="static-panel" static>
        Static contents
      </DisclosurePanel>
    </Disclosure>
  ));
}

export function renderPersistentDisclosure(): string {
  return renderToString(() => (
    <Disclosure>
      <DisclosureButton id="persistent-trigger">Toggle</DisclosureButton>
      <DisclosurePanel id="persistent-panel" unmount={false}>
        Persistent contents
      </DisclosurePanel>
    </Disclosure>
  ));
}

export function renderNestedButton(): string {
  return renderToString(() => (
    <Disclosure defaultOpen>
      <DisclosureButton id="primary-trigger">Open</DisclosureButton>
      <DisclosurePanel id="nested-panel">
        <DisclosureButton id="ignored-nested-id">Close</DisclosureButton>
      </DisclosurePanel>
    </Disclosure>
  ));
}

export function renderPolymorphicDisclosure(): string {
  return renderToString(() => (
    <Disclosure
      as="section"
      class={(slot) => ({ expanded: slot.open })}
      defaultOpen
    >
      <DisclosureButton as="div" autofocus role="button">
        Custom trigger
      </DisclosureButton>
      <DisclosurePanel as="article" transition>
        Custom panel
      </DisclosurePanel>
    </Disclosure>
  ));
}

export function renderDisabledDisclosure(): string {
  return renderToString(() => (
    <Disclosure>
      <DisclosureButton autofocus disabled>Unavailable</DisclosureButton>
      <DisclosurePanel>Never opened</DisclosurePanel>
    </Disclosure>
  ));
}

export function renderGeneratedDisclosure(): string {
  return renderToString(() => (
    <Disclosure defaultOpen>
      <DisclosureButton>Generated trigger</DisclosureButton>
      <DisclosurePanel>Generated panel</DisclosurePanel>
    </Disclosure>
  ));
}

export function renderOrphanButton(): string {
  return renderToString(() => <DisclosureButton>Orphan</DisclosureButton>);
}

export function renderOrphanPanel(): string {
  return renderToString(() => <DisclosurePanel>Orphan</DisclosurePanel>);
}
