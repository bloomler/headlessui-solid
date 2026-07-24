import { type JSX, render } from "@solidjs/web";
import { createSignal, DEV, type Element, flush, Show } from "solid-js";
import { afterEach, expect, test } from "vitest";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from "../src/components/menu/menu.tsx";

function ForwardButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement>,
): Element {
  return <button {...props} />;
}

const FRAME_MARKUP = '<button type="button">Frame action</button>';

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

function mount(children: () => Element): void {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(children, host);
}

async function settle(): Promise<void> {
  for (let pass = 0; pass < 4; pass++) {
    flush();
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  flush();
}

afterEach(async () => {
  dispose?.();
  host?.remove();
  document.getElementById("headlessui-portal-root")?.remove();
  dispose = undefined;
  host = undefined;
  await settle();
});

test("Menu resolves deferred keyboard focus after incremental item registration", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Menu>
      <MenuButton id="menu-regression-trigger">Actions</MenuButton>
      <MenuItems id="menu-regression-items" modal={false}>
        <MenuItem id="menu-regression-disabled" disabled>Disabled</MenuItem>
        <MenuItem id="menu-regression-alpha">Alpha</MenuItem>
        <MenuItem id="menu-regression-omega">Omega</MenuItem>
      </MenuItems>
    </Menu>
  ));

  const trigger = document.getElementById("menu-regression-trigger")!;
  trigger.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    }),
  );
  await settle();

  expect(
    document.getElementById("menu-regression-items")?.getAttribute(
      "aria-activedescendant",
    ),
  ).toBe("menu-regression-alpha");

  document.getElementById("menu-regression-items")?.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    }),
  );
  await settle();
  trigger.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowUp",
    }),
  );
  await settle();
  expect(
    document.getElementById("menu-regression-items")?.getAttribute(
      "aria-activedescendant",
    ),
  ).toBe("menu-regression-omega");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Menu item focus updates the active descendant after registration settles", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Menu>
      <MenuButton id="menu-focus-trigger">Focus items</MenuButton>
      <MenuItems id="menu-focus-items" modal={false}>
        <MenuItem id="menu-focus-alpha">Alpha</MenuItem>
        <MenuItem id="menu-focus-disabled" disabled>Disabled</MenuItem>
      </MenuItems>
    </Menu>
  ));

  document.getElementById("menu-focus-trigger")?.click();
  await settle();
  document.getElementById("menu-focus-alpha")?.focus();
  flush();
  expect(
    document.getElementById("menu-focus-items")?.getAttribute(
      "aria-activedescendant",
    ),
  ).toBe("menu-focus-alpha");

  document.getElementById("menu-focus-disabled")?.dispatchEvent(
    new FocusEvent("focus", { bubbles: true }),
  );
  flush();
  expect(
    document.getElementById("menu-focus-items")?.getAttribute(
      "aria-activedescendant",
    ),
  ).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Menu rekeys a mounted item when its reactive id changes", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let rename = () => {};
  let remove = () => {};

  function Example(): Element {
    const [itemId, setItemId] = createSignal("menu-reactive-id-old");
    const [visible, setVisible] = createSignal(true);
    rename = () => setItemId("menu-reactive-id-new");
    remove = () => setVisible(false);

    return (
      <Menu>
        <MenuButton id="menu-reactive-id-trigger">Reactive ids</MenuButton>
        <MenuItems id="menu-reactive-id-items" modal={false}>
          <Show when={visible()}>
            <MenuItem id={itemId()}>Reactive item</MenuItem>
          </Show>
          <MenuItem id="menu-reactive-id-remaining">Remaining item</MenuItem>
        </MenuItems>
      </Menu>
    );
  }

  mount(() => <Example />);
  document.getElementById("menu-reactive-id-trigger")?.click();
  await settle();

  rename();
  await settle();
  expect(document.getElementById("menu-reactive-id-old")).toBeNull();
  document.getElementById("menu-reactive-id-new")?.focus();
  await settle();
  expect(
    document.getElementById("menu-reactive-id-items")?.getAttribute(
      "aria-activedescendant",
    ),
  ).toBe("menu-reactive-id-new");

  remove();
  await settle();
  document.getElementById("menu-reactive-id-items")?.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Home",
    }),
  );
  await settle();
  expect(
    document.getElementById("menu-reactive-id-items")?.getAttribute(
      "aria-activedescendant",
    ),
  ).toBe("menu-reactive-id-remaining");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Menu resolves a custom component to button type after its ref commits", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Menu>
      <MenuButton as={ForwardButton} id="menu-regression-custom-button">
        Trigger
      </MenuButton>
      <MenuItems static>
        <MenuItem>Item</MenuItem>
      </MenuItems>
    </Menu>
  ));
  flush();

  expect(
    document.getElementById("menu-regression-custom-button")?.getAttribute(
      "type",
    ),
  ).toBe("button");
  await settle();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Menu treats focus entering an iframe as an outside interaction", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <>
      <Menu>
        <MenuButton id="menu-iframe-trigger">Iframe menu</MenuButton>
        <MenuItems id="menu-iframe-items" modal={false}>
          <MenuItem>Item</MenuItem>
        </MenuItems>
      </Menu>
      <iframe
        id="menu-outside-iframe"
        title="Outside frame"
        srcdoc={FRAME_MARKUP}
      />
    </>
  ));

  document.getElementById("menu-iframe-trigger")?.click();
  await settle();
  const iframe = document.getElementById(
    "menu-outside-iframe",
  ) as HTMLIFrameElement;
  iframe.focus();
  globalThis.dispatchEvent(new FocusEvent("blur"));
  await settle();

  expect(document.getElementById("menu-iframe-items")).toBeNull();
  expect(document.activeElement).toBe(iframe);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
