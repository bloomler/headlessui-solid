import { renderToString } from "@solidjs/web";
import { Portal, PortalGroup } from "../../src/components/portal/portal.tsx";

export function renderEnabledPortal(): string {
  return renderToString(() => (
    <main id="server-parent">
      Before
      <Portal>
        <span id="portalled">Portalled</span>
      </Portal>
      After
    </main>
  ));
}

export function renderDisabledPortal(): string {
  return renderToString(() => (
    <main id="server-parent">
      <Portal enabled={false} as="section" id="inline-portal">
        Inline
      </Portal>
    </main>
  ));
}

export function renderPortalGroup(): string {
  return renderToString(() => (
    <PortalGroup target={null}>
      <p id="group-sibling">Sibling</p>
      <Portal>
        <span id="grouped-portal">Grouped portal</span>
      </Portal>
    </PortalGroup>
  ));
}
