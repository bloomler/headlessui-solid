import { renderToString } from "@solidjs/web";
import {
  Popover,
  PopoverBackdrop,
  PopoverButton,
  PopoverGroup,
  PopoverOverlay,
  PopoverPanel,
} from "../../src/components/popover/popover.tsx";

export function renderClosedPopover(): string {
  return renderToString(() => (
    <Popover id="account-popover">
      <PopoverButton id="account-button">Account</PopoverButton>
      <PopoverBackdrop id="account-backdrop" />
      <PopoverPanel id="account-panel">Panel</PopoverPanel>
    </Popover>
  ));
}

export function renderOpenPopover(): string {
  return renderToString(() => (
    <Popover.Group id="navigation-group">
      <Popover __demoMode id="navigation-popover">
        {({ open }) => (
          <>
            <Popover.Button id="navigation-button">
              {open ? "Open navigation" : "Closed navigation"}
            </Popover.Button>
            <Popover.Backdrop id="navigation-backdrop" />
            <Popover.Panel id="navigation-panel" modal={false}>
              {({ open: panelOpen }) =>
                panelOpen ? <a href="/docs">Documentation</a> : "Closed"}
            </Popover.Panel>
          </>
        )}
      </Popover>
    </Popover.Group>
  ));
}

export function renderRetainedPopover(): string {
  return renderToString(() => (
    <Popover>
      <PopoverButton>Toggle</PopoverButton>
      <PopoverBackdrop unmount={false}>Retained backdrop</PopoverBackdrop>
      <PopoverPanel unmount={false}>Retained panel</PopoverPanel>
    </Popover>
  ));
}

export function renderStaticPopover(): string {
  return renderToString(() => (
    <Popover>
      <PopoverButton>Toggle</PopoverButton>
      <PopoverOverlay static id="static-overlay" />
      <PopoverPanel static id="static-panel">Static panel</PopoverPanel>
    </Popover>
  ));
}

export function staticsArePreserved(): boolean {
  return Popover.Button === PopoverButton &&
    Popover.Backdrop === PopoverBackdrop &&
    Popover.Overlay === PopoverOverlay &&
    Popover.Panel === PopoverPanel &&
    Popover.Group === PopoverGroup &&
    PopoverOverlay === PopoverBackdrop;
}

export function renderOrphanButton(): string {
  return renderToString(() => <PopoverButton>Orphan</PopoverButton>);
}

export function renderOrphanBackdrop(): string {
  return renderToString(() => <PopoverBackdrop>Orphan</PopoverBackdrop>);
}

export function renderOrphanOverlay(): string {
  return renderToString(() => <PopoverOverlay>Orphan</PopoverOverlay>);
}

export function renderOrphanPanel(): string {
  return renderToString(() => <PopoverPanel>Orphan</PopoverPanel>);
}
