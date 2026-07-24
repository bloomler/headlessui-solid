import { renderToString } from "@solidjs/web";
import {
  Menu,
  MenuButton,
  MenuHeading,
  MenuItem,
  MenuItems,
  MenuSection,
  MenuSeparator,
} from "../../src/components/menu/menu.tsx";

export function renderClosedMenu(): string {
  return renderToString(() => (
    <Menu>
      <MenuButton id="account-button">Account</MenuButton>
      <MenuItems id="account-items">
        <MenuItem>Profile</MenuItem>
      </MenuItems>
    </Menu>
  ));
}

export function renderOpenMenu(): string {
  return renderToString(() => (
    <Menu __demoMode>
      <Menu.Button id="open-button">Actions</Menu.Button>
      <Menu.Items id="open-items" modal={false}>
        <Menu.Section>
          <Menu.Heading id="file-heading">File</Menu.Heading>
          <Menu.Item id="new-item">New</Menu.Item>
          <Menu.Separator />
          <MenuItem as="a" href="/open" disabled>
            Open
          </MenuItem>
        </Menu.Section>
      </Menu.Items>
    </Menu>
  ));
}

export function renderRetainedMenu(): string {
  return renderToString(() => (
    <Menu>
      <MenuButton>Toggle</MenuButton>
      <MenuItems unmount={false}>
        <MenuItem>Retained</MenuItem>
      </MenuItems>
    </Menu>
  ));
}

export function renderOrphanButton(): string {
  return renderToString(() => <MenuButton>Orphan</MenuButton>);
}

export function renderOrphanItems(): string {
  return renderToString(() => <MenuItems>Orphan</MenuItems>);
}

export function renderOrphanItem(): string {
  return renderToString(() => <MenuItem>Orphan</MenuItem>);
}

// Keep direct named exports referenced so Deno checks the complete family.
export const namedFamily = {
  MenuHeading,
  MenuSection,
  MenuSeparator,
};
