import { type JSX, render } from "@solidjs/web";
import { createSignal, DEV, type Element, flush, For, Show } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  Menu,
  MenuButton,
  MenuHeading,
  MenuItem,
  MenuItems,
  MenuSection,
  MenuSeparator,
} from "../src/components/menu/menu.tsx";
import {
  Transition,
  TransitionChild,
} from "../src/components/transition/transition.tsx";

function MenuForwardButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement>,
): Element {
  return <button {...props} />;
}

function MenuForwardDiv(props: JSX.HTMLAttributes<HTMLDivElement>): Element {
  return <div {...props} />;
}

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  host?.remove();
  document.getElementById("headlessui-portal-root")?.remove();
  dispose = undefined;
  host = undefined;
});

function mount(children: () => Element): void {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(children, host);
  flush();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

function dispatchPointer(
  target: globalThis.Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  clientX: number,
  clientY: number,
): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX,
    clientY,
    composed: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  target.dispatchEvent(event);
  flush();
  return event;
}

test(
  "should be possible to click outside of the menu into an iframe and which should close the menu",
  async () => {
    const diagnostics = DEV?.diagnostics.capture();

    mount(() => (
      <>
        <Menu>
          <MenuButton>Iframe menu</MenuButton>
          <MenuItems id="iframe-menu-items" modal={false}>
            <MenuItem>Iframe menu action</MenuItem>
          </MenuItems>
        </Menu>
        <iframe
          data-testid="outside-menu-frame"
          id="outside-menu-frame"
          srcdoc='<button type="button">Inside frame</button>'
        />
      </>
    ));

    await page.getByRole("button", { name: "Iframe menu" }).click();
    expect(document.getElementById("iframe-menu-items")).not.toBeNull();

    const frame = page.frameLocator(
      page.getByTestId("outside-menu-frame"),
    );
    await frame.getByRole("button", { name: "Inside frame" }).click();
    await settle();

    expect(document.getElementById("iframe-menu-items")).toBeNull();
    expect(document.activeElement?.id).toBe("outside-menu-frame");
    expect(diagnostics?.stop() ?? []).toEqual([]);
  },
);

test("mouse pointerdown opens and held drag-release selects a Menu item", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const calls: string[] = [];

  mount(() => (
    <Menu>
      <MenuButton id="quick-menu-trigger">Quick menu</MenuButton>
      <MenuItems id="quick-menu-items" modal={false}>
        <MenuItem
          id="quick-menu-item"
          onClick={() => calls.push("selected")}
        >
          Quick action
        </MenuItem>
      </MenuItems>
    </Menu>
  ));

  const trigger = document.getElementById("quick-menu-trigger")!;
  const pointerDown = dispatchPointer(trigger, "pointerdown", 1, 1);
  expect(pointerDown.defaultPrevented).toBe(true);
  await settle();
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(document.getElementById("quick-menu-items")).not.toBeNull();

  const item = document.getElementById("quick-menu-item")!;
  dispatchPointer(item, "pointermove", 20, 20);
  expect(
    document.getElementById("quick-menu-items")?.getAttribute(
      "aria-activedescendant",
    ),
  ).toBe("quick-menu-item");
  await delay(225);
  dispatchPointer(item, "pointerup", 20, 20);
  await settle();

  expect(calls).toEqual(["selected"]);
  expect(document.getElementById("quick-menu-items")).toBeNull();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("keyboard navigation skips disabled items and restores focus", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <Menu>
      <MenuButton id="keyboard-trigger">Actions</MenuButton>
      <MenuItems id="keyboard-items" modal={false}>
        <MenuItem id="disabled-first" disabled>Disabled</MenuItem>
        <MenuItem id="alpha-item">Alpha</MenuItem>
        <MenuItem id="beta-item">Beta</MenuItem>
      </MenuItems>
    </Menu>
  ));

  const trigger = page.getByRole("button", { name: "Actions" });
  trigger.element().focus();
  await userEvent.keyboard("{Enter}");
  await settle();
  const menu = page.getByRole("menu");
  await expect.element(menu).toHaveAttribute(
    "aria-labelledby",
    "keyboard-trigger",
  );
  await expect.element(menu).toHaveAttribute(
    "aria-activedescendant",
    "alpha-item",
  );
  expect(document.activeElement?.id).toBe("keyboard-items");

  await userEvent.keyboard("{ArrowDown}");
  await expect.element(menu).toHaveAttribute(
    "aria-activedescendant",
    "beta-item",
  );
  await userEvent.keyboard("{Home}");
  await expect.element(menu).toHaveAttribute(
    "aria-activedescendant",
    "alpha-item",
  );
  await userEvent.keyboard("{End}");
  await expect.element(menu).toHaveAttribute(
    "aria-activedescendant",
    "beta-item",
  );

  await userEvent.keyboard("{Escape}");
  expect(document.getElementById("keyboard-items")).toBeNull();
  expect(document.activeElement?.id).toBe("keyboard-trigger");
  await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("typeahead skips disabled matches and Enter invokes the active item", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const calls: string[] = [];

  mount(() => (
    <Menu>
      <MenuButton>Search commands</MenuButton>
      <MenuItems id="search-items" modal={false}>
        <MenuItem
          id="bravo-disabled"
          disabled
          onClick={() => calls.push("disabled")}
        >
          Bravo
        </MenuItem>
        <MenuItem id="beta-item" as="button" onClick={() => calls.push("beta")}>
          Beta
        </MenuItem>
        <MenuItem
          id="charlie-item"
          as="button"
          onClick={() => calls.push("charlie")}
        >
          Charlie command
        </MenuItem>
      </MenuItems>
    </Menu>
  ));

  await page.getByRole("button", { name: "Search commands" }).click();
  const menu = page.getByRole("menu");
  await expect.element(menu).not.toHaveAttribute("aria-activedescendant");
  await userEvent.keyboard("b");
  await expect.element(menu).toHaveAttribute(
    "aria-activedescendant",
    "beta-item",
  );

  await delay(400);
  await userEvent.keyboard("c");
  await userEvent.keyboard("h");
  await expect.element(menu).toHaveAttribute(
    "aria-activedescendant",
    "charlie-item",
  );
  await userEvent.keyboard("{Enter}");
  expect(calls).toEqual(["charlie"]);
  expect(document.getElementById("search-items")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("pointer, disabled, outside-click, sibling, and portal behavior compose", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const calls: string[] = [];

  mount(() => (
    <>
      <span id="outside-nonfocusable">Outside text</span>
      <button id="outside-focusable" type="button">Outside button</button>
      <Menu>
        <MenuButton id="first-trigger">First menu</MenuButton>
        <MenuItems id="first-items" modal={false} portal>
          <MenuItem
            id="disabled-pointer"
            disabled
            onClick={() => calls.push("disabled")}
          >
            Disabled action
          </MenuItem>
          <MenuItem id="enabled-pointer" onClick={() => calls.push("enabled")}>
            Enabled action
          </MenuItem>
        </MenuItems>
      </Menu>
      <Menu>
        <MenuButton id="second-trigger">Second menu</MenuButton>
        <MenuItems id="second-items" modal={false}>
          <MenuItem>Second action</MenuItem>
        </MenuItems>
      </Menu>
    </>
  ));

  await page.getByRole("button", { name: "First menu" }).click();
  await expect.poll(() =>
    document.querySelector("#headlessui-portal-root #first-items")
  ).not.toBeNull();

  const disabled = page.getByRole("menuitem", { name: "Disabled action" });
  await disabled.hover();
  await expect.element(page.getByRole("menu")).not.toHaveAttribute(
    "aria-activedescendant",
  );
  await disabled.click({ force: true });
  expect(calls).toEqual([]);
  expect(document.getElementById("first-items")).not.toBeNull();

  const enabled = page.getByRole("menuitem", { name: "Enabled action" });
  await enabled.hover();
  await expect.element(page.getByRole("menu")).toHaveAttribute(
    "aria-activedescendant",
    "enabled-pointer",
  );

  await page.getByRole("button", { name: "Second menu" }).click();
  expect(document.getElementById("first-items")).toBeNull();
  expect(document.getElementById("second-items")).not.toBeNull();

  await page.getByRole("button", { name: "Outside button" }).click();
  expect(document.getElementById("second-items")).toBeNull();
  expect(document.activeElement?.id).toBe("outside-focusable");

  await page.getByRole("button", { name: "First menu" }).click();
  await page.getByText("Outside text").click();
  expect(document.getElementById("first-items")).toBeNull();
  expect(document.activeElement?.id).toBe("first-trigger");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("sections, render strategies, render props, and polymorphism stay semantic", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <Menu>
        {(root) => (
          <>
            <MenuButton id="semantic-trigger">
              {(button) => button.open ? "Close semantic" : "Open semantic"}
            </MenuButton>
            <MenuItems id="semantic-items" modal={false}>
              <MenuSection id="semantic-section">
                <MenuHeading id="semantic-heading">Files</MenuHeading>
                <span id="semantic-wrapper">
                  <span id="semantic-inner">
                    <MenuItem as="a" href="#new" id="semantic-item">
                      {(item) => item.focus ? "New focused" : "New"}
                    </MenuItem>
                  </span>
                </span>
                <MenuSeparator id="semantic-separator" />
                <MenuItem as="button" onClick={root.close}>
                  Close from slot
                </MenuItem>
              </MenuSection>
            </MenuItems>
          </>
        )}
      </Menu>
      <Menu>
        <MenuButton>Persistent</MenuButton>
        <MenuItems id="persistent-items" modal={false} unmount={false}>
          <MenuItem>Retained</MenuItem>
        </MenuItems>
      </Menu>
      <Menu>
        <MenuButton>Static</MenuButton>
        <MenuItems id="static-items" modal={false} static>
          <MenuItem>Always</MenuItem>
        </MenuItems>
      </Menu>
    </>
  ));

  const persistent = document.getElementById("persistent-items")!;
  expect(persistent.hidden).toBe(true);
  expect(persistent.style.display).toBe("none");
  const staticItems = document.getElementById("static-items")!;
  expect(staticItems.hidden).toBe(false);
  expect(staticItems.style.display).toBe("");

  page.getByRole("button", { name: "Open semantic" }).element().focus();
  await userEvent.keyboard("{Enter}");
  const section = document.getElementById("semantic-section")!;
  expect(section.getAttribute("role")).toBe("group");
  expect(section.getAttribute("aria-labelledby")).toBe("semantic-heading");
  expect(document.getElementById("semantic-heading")?.getAttribute("role"))
    .toBe("presentation");
  expect(document.getElementById("semantic-separator")?.getAttribute("role"))
    .toBe("separator");
  expect(document.getElementById("semantic-wrapper")?.getAttribute("role"))
    .toBe("none");
  expect(document.getElementById("semantic-inner")?.getAttribute("role"))
    .toBe("none");
  const item = document.getElementById("semantic-item")!;
  expect(item.tagName).toBe("A");
  expect(item.getAttribute("href")).toBe("#new");

  await page.getByRole("menuitem", { name: "Close from slot" }).click();
  expect(document.getElementById("semantic-items")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("anchor auto-portals and transition retains the menu through leave", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <style>
        {`
          #anchored-items {
            --anchor-gap: 8px;
            --anchor-offset: 4px;
            --anchor-padding: 2px;
            width: 120px;
            height: 50px;
            transition-property: opacity;
            transition-duration: 140ms;
          }
          #anchored-items[data-closed] { opacity: 0; }
        `}
      </style>
      <Menu>
        <MenuButton
          id="anchor-trigger"
          ref={(element) => {
            element.getBoundingClientRect = () => new DOMRect(100, 100, 80, 30);
          }}
        >
          Anchored
        </MenuButton>
        <MenuItems
          id="anchored-items"
          modal={false}
          transition
          anchor="bottom end"
          ref={(element) => {
            element.getBoundingClientRect = () => new DOMRect(0, 0, 120, 50);
          }}
        >
          <MenuItem>Anchored action</MenuItem>
        </MenuItems>
      </Menu>
    </>
  ));

  // Let the inline stylesheet participate in a rendered frame before leave.
  await delay(25);
  const trigger = page.getByRole("button", { name: "Anchored" });
  await trigger.click();
  await expect.poll(() => document.getElementById("anchored-items"))
    .not.toBeNull();
  const items = document.getElementById("anchored-items")!;
  expect(items.closest("#headlessui-portal-root")).not.toBeNull();
  await expect.poll(() => items.getAttribute("data-anchor")).toBe("bottom end");
  await expect.poll(() => ({
    buttonWidth: items.style.getPropertyValue("--button-width"),
    left: items.style.left,
    position: items.style.position,
    top: items.style.top,
  })).toEqual({
    buttonWidth: "80px",
    left: "64px",
    position: "absolute",
    top: "138px",
  });

  await expect.element(page.getByRole("menu"), { timeout: 2_000 })
    .not.toHaveAttribute("data-transition");
  await trigger.click();
  await expect.element(page.getByRole("menu")).toHaveAttribute(
    "data-leave",
    "",
  );
  expect(document.getElementById("anchored-items")).not.toBeNull();
  await expect.poll(() => document.getElementById("anchored-items"), {
    timeout: 2_000,
  }).toBeNull();
  expect(document.activeElement?.id).toBe("anchor-trigger");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("closed anchored menus can be removed from a keyed For", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let keepFirstTwo = () => {};

  function Example() {
    const [items, setItems] = createSignal([1, 2, 3, 4]);
    keepFirstTwo = () => setItems((current) => current.slice(0, 2));

    return (
      <>
        <output id="dynamic-menu-count">{items().length}</output>
        <For each={items()}>
          {(item) => (
            <div data-dynamic-menu={item}>
              <Menu>
                <MenuButton>Menu {item}</MenuButton>
                <MenuItems anchor="bottom" modal={false}>
                  <MenuItem>Action {item}</MenuItem>
                </MenuItems>
              </Menu>
            </div>
          )}
        </For>
      </>
    );
  }

  mount(() => <Example />);
  await settle();

  expect(document.querySelectorAll("[data-dynamic-menu]")).toHaveLength(4);
  expect(
    document.getElementById("headlessui-portal-root")?.childElementCount,
  ).toBe(4);

  keepFirstTwo();
  await settle();

  expect(document.getElementById("dynamic-menu-count")?.textContent).toBe("2");
  expect(document.querySelectorAll("[data-dynamic-menu]")).toHaveLength(2);
  expect(
    document.getElementById("headlessui-portal-root")?.childElementCount,
  ).toBe(2);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Menu opening, boundary aliases, and Tab traversal match the upstream keyboard matrix", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <button id="before-menu" type="button">Before menu</button>
      <Menu>
        <MenuButton id="matrix-trigger">Keyboard matrix</MenuButton>
        <MenuItems id="matrix-items" modal={false}>
          <MenuItem id="matrix-alpha">Alpha matrix</MenuItem>
          <MenuItem id="matrix-disabled" disabled>Disabled matrix</MenuItem>
          <MenuItem id="matrix-gamma">Gamma matrix</MenuItem>
        </MenuItems>
      </Menu>
      <button id="after-menu" type="button">After menu</button>
    </>
  ));

  const trigger = page.getByRole("button", { name: "Keyboard matrix" });
  trigger.element().focus();
  await userEvent.keyboard("{ArrowUp}");
  await settle();
  let menu = page.getByRole("menu");
  await expect.element(menu).toHaveAttribute(
    "aria-activedescendant",
    "matrix-gamma",
  );
  await userEvent.keyboard("{Escape}");

  trigger.element().focus();
  await userEvent.keyboard(" ");
  menu = page.getByRole("menu");
  await expect.element(menu).toHaveAttribute(
    "aria-activedescendant",
    "matrix-alpha",
  );
  await userEvent.keyboard("{PageDown}");
  await expect.element(menu).toHaveAttribute(
    "aria-activedescendant",
    "matrix-gamma",
  );
  await userEvent.keyboard("{PageUp}");
  await expect.element(menu).toHaveAttribute(
    "aria-activedescendant",
    "matrix-alpha",
  );
  await userEvent.keyboard("{ArrowUp}");
  await expect.element(menu).toHaveAttribute(
    "aria-activedescendant",
    "matrix-alpha",
  );
  await userEvent.keyboard("{End}{ArrowDown}");
  await expect.element(menu).toHaveAttribute(
    "aria-activedescendant",
    "matrix-gamma",
  );

  await userEvent.keyboard("{Tab}");
  expect(document.getElementById("matrix-items")).toBeNull();
  expect(document.activeElement?.id).toBe("after-menu");

  trigger.element().focus();
  await userEvent.keyboard("{Enter}");
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  expect(document.getElementById("matrix-items")).toBeNull();
  expect(document.activeElement?.id).toBe("before-menu");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Menu polymorphism, button types, class functions, and slots preserve their contracts", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <form>
        <Menu as="section" id="contract-root">
          {(root) => (
            <>
              <output id="root-state">
                {root.open ? "root-open" : "root-closed"}
              </output>
              <MenuButton
                id="contract-trigger"
                class={(slot) => slot.open ? "trigger-open" : "trigger-closed"}
              >
                {(slot) => slot.open ? "Close contracts" : "Open contracts"}
              </MenuButton>
              <MenuItems
                id="contract-items"
                modal={false}
                static
                class={(slot) => slot.open ? "items-open" : "items-closed"}
              >
                {(items) => (
                  <>
                    <output id="items-state">
                      {items.open ? "items-open" : "items-closed"}
                    </output>
                    <MenuItem
                      as="button"
                      type="button"
                      id="contract-disabled"
                      disabled
                      class={(slot) =>
                        slot.disabled ? "item-disabled" : "item-enabled"}
                    >
                      Disabled contract
                    </MenuItem>
                    <MenuItem as="button" type="button" onClick={root.close}>
                      Close through root
                    </MenuItem>
                  </>
                )}
              </MenuItems>
            </>
          )}
        </Menu>
        <Menu>
          <MenuButton id="explicit-trigger" type="submit">
            Explicit submit
          </MenuButton>
          <MenuItems static>
            <MenuItem>Explicit item</MenuItem>
          </MenuItems>
        </Menu>
        <Menu>
          <MenuButton as="div" id="polymorphic-trigger">Div trigger</MenuButton>
          <MenuItems static>
            <MenuItem>Polymorphic item</MenuItem>
          </MenuItems>
        </Menu>
      </form>
    </>
  ));

  const root = document.getElementById("contract-root")!;
  const trigger = document.getElementById("contract-trigger")!;
  const disabled = document.getElementById("contract-disabled")!;
  expect(root.tagName).toBe("SECTION");
  expect(trigger.getAttribute("type")).toBe("button");
  expect(trigger.classList.contains("trigger-closed")).toBe(true);
  expect(document.getElementById("explicit-trigger")?.getAttribute("type"))
    .toBe("submit");
  expect(document.getElementById("polymorphic-trigger")?.tagName).toBe("DIV");
  expect(document.getElementById("polymorphic-trigger")?.hasAttribute("type"))
    .toBe(false);
  expect(disabled.getAttribute("aria-disabled")).toBe("true");
  expect(disabled.classList.contains("item-disabled")).toBe(true);

  await page.getByRole("button", { name: "Open contracts" }).click();
  expect(document.getElementById("root-state")?.textContent).toBe("root-open");
  expect(document.getElementById("items-state")?.textContent).toBe(
    "items-open",
  );
  expect(trigger.classList.contains("trigger-open")).toBe(true);
  await page.getByRole("menuitem", { name: "Close through root" }).click();
  expect(document.getElementById("root-state")?.textContent).toBe(
    "root-closed",
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Menu focus, pointer movement, leave, disabled, right-click, and focusable-ancestor cases compose", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <button id="focusable-ancestor" type="button">
        <span id="focusable-ancestor-child">Focusable ancestor child</span>
      </button>
      <Menu>
        <MenuButton id="pointer-matrix-trigger">Pointer matrix</MenuButton>
        <MenuItems id="pointer-matrix-items" modal={false}>
          <MenuItem id="pointer-matrix-alpha">Pointer alpha</MenuItem>
          <MenuItem id="pointer-matrix-disabled" disabled>
            Pointer disabled
          </MenuItem>
        </MenuItems>
      </Menu>
      <Menu>
        <MenuButton id="disabled-menu-trigger" disabled>
          Disabled trigger
        </MenuButton>
        <MenuItems id="disabled-trigger-items" static>
          <MenuItem>Never opens</MenuItem>
        </MenuItems>
      </Menu>
    </>
  ));

  const trigger = document.getElementById("pointer-matrix-trigger")!;
  trigger.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, button: 2 }),
  );
  expect(document.getElementById("pointer-matrix-items")).toBeNull();
  document.getElementById("disabled-menu-trigger")?.click();
  expect(
    document.getElementById("disabled-menu-trigger")?.getAttribute(
      "aria-expanded",
    ),
  ).toBe("false");
  for (const key of ["Enter", " ", "ArrowDown", "ArrowUp"]) {
    document.getElementById("disabled-menu-trigger")?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key }),
    );
  }
  expect(
    document.getElementById("disabled-menu-trigger")?.getAttribute(
      "aria-expanded",
    ),
  ).toBe("false");

  trigger.click();
  await settle();
  const menu = document.getElementById("pointer-matrix-items")!;
  const alphaItem = document.getElementById("pointer-matrix-alpha")!;
  const disabledItem = document.getElementById("pointer-matrix-disabled")!;
  alphaItem.focus();
  flush();
  expect(menu.getAttribute("aria-activedescendant")).toBe(
    "pointer-matrix-alpha",
  );
  disabledItem.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  flush();
  expect(menu.hasAttribute("aria-activedescendant")).toBe(false);

  alphaItem.dispatchEvent(
    new MouseEvent("mouseenter", { bubbles: true, clientX: 1, clientY: 1 }),
  );
  alphaItem.dispatchEvent(
    new MouseEvent("mousemove", { bubbles: true, clientX: 2, clientY: 2 }),
  );
  flush();
  expect(menu.getAttribute("aria-activedescendant")).toBe(
    "pointer-matrix-alpha",
  );
  alphaItem.dispatchEvent(
    new MouseEvent("mousemove", { bubbles: true, clientX: 2, clientY: 2 }),
  );
  expect(menu.getAttribute("aria-activedescendant")).toBe(
    "pointer-matrix-alpha",
  );
  alphaItem.dispatchEvent(
    new MouseEvent("mouseleave", { bubbles: true, clientX: 3, clientY: 3 }),
  );
  flush();
  expect(menu.hasAttribute("aria-activedescendant")).toBe(false);
  disabledItem.dispatchEvent(
    new MouseEvent("mousemove", { bubbles: true, clientX: 4, clientY: 4 }),
  );
  disabledItem.dispatchEvent(
    new MouseEvent("mouseleave", { bubbles: true, clientX: 5, clientY: 5 }),
  );
  expect(menu.hasAttribute("aria-activedescendant")).toBe(false);

  await page.getByText("Focusable ancestor child").click();
  expect(document.getElementById("pointer-matrix-items")).toBeNull();
  await page.getByText("Focusable ancestor child").click();
  expect(document.getElementById("pointer-matrix-items")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to render a Menu.Button using a render prop and an `as` prop", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Menu>
      <MenuButton as={MenuForwardButton} id="menu-render-as">
        {(slot) => slot.open ? "Close render-as" : "Open render-as"}
      </MenuButton>
      <MenuItems id="menu-render-as-items" modal={false}>
        <MenuItem>Render-as item</MenuItem>
      </MenuItems>
    </Menu>
  ));

  const trigger = page.getByRole("button", { name: "Open render-as" });
  expect(trigger.element().id).toBe("menu-render-as");
  await trigger.click();
  await expect.element(page.getByRole("button", { name: "Close render-as" }))
    .toBeVisible();
  expect(document.getElementById("menu-render-as-items")).not.toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test('should set the `type` to "button" when using the `as` prop which resolves to a "button"', () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Menu>
      <MenuButton as={MenuForwardButton} id="menu-custom-button">
        Custom button target
      </MenuButton>
      <MenuItems static>
        <MenuItem>Custom item</MenuItem>
      </MenuItems>
    </Menu>
  ));
  expect(document.getElementById("menu-custom-button")?.getAttribute("type"))
    .toBe("button");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test('should not set the `type` to "button" when using the `as` prop which resolves to a "div"', () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Menu>
      <MenuButton as={MenuForwardDiv} id="menu-custom-div">
        Custom div target
      </MenuButton>
      <MenuItems static>
        <MenuItem>Custom div item</MenuItem>
      </MenuItems>
    </Menu>
  ));
  expect(document.getElementById("menu-custom-div")?.tagName).toBe("DIV");
  expect(document.getElementById("menu-custom-div")?.hasAttribute("type"))
    .toBe(false);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to render a MenuButton using as={Fragment} [Solid explicit-target adaptation]", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Menu>
      <MenuButton as={MenuForwardButton} id="menu-fragment-adapter">
        Adapted Fragment trigger
      </MenuButton>
      <MenuItems id="menu-fragment-adapter-items" modal={false}>
        <MenuItem>Adapted item</MenuItem>
      </MenuItems>
    </Menu>
  ));

  const trigger = page.getByRole("button", {
    name: "Adapted Fragment trigger",
  });
  expect(trigger.element().id).toBe("menu-fragment-adapter");
  await trigger.click();
  expect(document.getElementById("menu-fragment-adapter-items")).not.toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should not override an explicit disabled prop on MenuItems child", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Menu>
      <MenuButton>Child disabled contract</MenuButton>
      <MenuItems modal={false}>
        <MenuItem>
          {(slot) => (
            <button
              id="menu-child-enabled"
              type="button"
              disabled={slot.disabled}
            >
              Enabled child
            </button>
          )}
        </MenuItem>
        <MenuItem disabled>
          {(slot) => (
            <button
              id="menu-child-disabled"
              type="button"
              disabled={slot.disabled}
            >
              Disabled child
            </button>
          )}
        </MenuItem>
      </MenuItems>
    </Menu>
  ));

  await page.getByRole("button", { name: "Child disabled contract" }).click();
  expect(
    (document.getElementById("menu-child-enabled") as HTMLButtonElement)
      .disabled,
  )
    .toBe(false);
  expect(
    (document.getElementById("menu-child-disabled") as HTMLButtonElement)
      .disabled,
  )
    .toBe(true);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should guarantee the order of DOM nodes when performing Menu actions", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let toggleMiddle = () => {};

  function OrderedMenu() {
    const [middle, setMiddle] = createSignal(true);
    toggleMiddle = () => setMiddle((value) => !value);
    return (
      <Menu>
        <MenuButton>Ordered menu</MenuButton>
        <MenuItems id="ordered-menu-items" modal={false}>
          <MenuItem id="ordered-menu-alpha">Ordered alpha</MenuItem>
          <Show when={middle()}>
            <MenuItem id="ordered-menu-beta">Ordered beta</MenuItem>
          </Show>
          <MenuItem id="ordered-menu-gamma">Ordered gamma</MenuItem>
        </MenuItems>
      </Menu>
    );
  }

  mount(() => <OrderedMenu />);
  await page.getByRole("button", { name: "Ordered menu" }).click();
  toggleMiddle();
  toggleMiddle();
  await delay(25);
  flush();
  await userEvent.keyboard("{Home}{ArrowDown}");
  await expect.element(page.getByRole("menu")).toHaveAttribute(
    "aria-activedescendant",
    "ordered-menu-beta",
  );
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(page.getByRole("menu")).toHaveAttribute(
    "aria-activedescendant",
    "ordered-menu-gamma",
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to wrap the Menu.Items with a Transition component", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Menu>
      <MenuButton>Transition-wrapped menu</MenuButton>
      <Transition as="div" transition={false}>
        <MenuItems id="transition-wrapped-menu" modal={false}>
          <MenuItem>Wrapped item</MenuItem>
        </MenuItems>
      </Transition>
    </Menu>
  ));

  const trigger = page.getByRole("button", { name: "Transition-wrapped menu" });
  await trigger.click();
  expect(document.getElementById("transition-wrapped-menu")).not.toBeNull();
  await trigger.click();
  expect(document.getElementById("transition-wrapped-menu")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to wrap the Menu.Items with a Transition.Child component", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Menu>
      <MenuButton>Transition-child menu</MenuButton>
      <TransitionChild as="div" transition={false}>
        <MenuItems id="transition-child-menu" modal={false}>
          <MenuItem>Child-wrapped item</MenuItem>
        </MenuItems>
      </TransitionChild>
    </Menu>
  ));

  const trigger = page.getByRole("button", { name: "Transition-child menu" });
  await trigger.click();
  expect(document.getElementById("transition-child-menu")).not.toBeNull();
  await trigger.click();
  expect(document.getElementById("transition-child-menu")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
