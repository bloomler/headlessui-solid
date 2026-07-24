import { type JSX, render } from "@solidjs/web";
import { createSignal, DEV, flush, For } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  Listbox,
  ListboxButton,
  ListboxLabel,
  ListboxOption,
  ListboxOptions,
  ListboxSelectedOption,
} from "../src/components/listbox/listbox.tsx";
import { Transition } from "../src/components/transition/transition.tsx";

function ListboxForwardButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement>,
): ReturnType<typeof ListboxButton> {
  return <button {...props} />;
}

function ListboxForwardDiv(
  props: JSX.HTMLAttributes<HTMLDivElement>,
): ReturnType<typeof ListboxButton> {
  return <div {...props} />;
}

interface Person {
  id: number;
  name: string;
}

const alice = { id: 1, name: "Alice" };
const bob = { id: 2, name: "Bob" };
const carol = { id: 3, name: "Carol" };
const dora = { id: 4, name: "Dora" };

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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

function mount(children: () => ReturnType<typeof Listbox>): void {
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

test("mouse pointerdown opens and held drag-release selects a Listbox option", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const changes: string[] = [];

  mount(() => (
    <Listbox
      defaultValue="alpha"
      onChange={(value) => changes.push(value)}
    >
      <ListboxButton id="quick-listbox-trigger">Quick listbox</ListboxButton>
      <ListboxOptions id="quick-listbox-options" modal={false}>
        <ListboxOption id="quick-listbox-alpha" value="alpha">
          Quick alpha
        </ListboxOption>
        <ListboxOption id="quick-listbox-beta" value="beta">
          Quick beta
        </ListboxOption>
      </ListboxOptions>
    </Listbox>
  ));
  await settle();

  const trigger = document.getElementById("quick-listbox-trigger")!;
  const pointerDown = dispatchPointer(trigger, "pointerdown", 1, 1);
  expect(pointerDown.defaultPrevented).toBe(true);
  await settle();
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(document.getElementById("quick-listbox-options")).not.toBeNull();

  const option = document.getElementById("quick-listbox-beta")!;
  dispatchPointer(option, "pointermove", 20, 20);
  expect(
    document.getElementById("quick-listbox-options")?.getAttribute(
      "aria-activedescendant",
    ),
  ).toBe("quick-listbox-beta");
  await new Promise((resolve) => setTimeout(resolve, 225));
  dispatchPointer(option, "pointerup", 20, 20);
  await settle();

  expect(changes).toEqual(["beta"]);
  expect(document.getElementById("quick-listbox-options")).toBeNull();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Listbox keyboard selection, disabled skipping, labels, and typeahead", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const changes: Person[] = [];

  mount(() => (
    <Listbox
      by="id"
      defaultValue={{ ...bob }}
      onChange={(value) => changes.push(value)}
    >
      <ListboxLabel id="people-label">Person</ListboxLabel>
      <ListboxButton id="people-button">
        {(slot) => (slot.value as Person | undefined)?.name ?? "Choose"}
      </ListboxButton>
      <ListboxOptions id="people-options">
        <ListboxOption id="person-alice" value={alice}>Alice</ListboxOption>
        <ListboxOption id="person-bob" value={bob}>Bob</ListboxOption>
        <ListboxOption id="person-carol" value={carol} disabled>
          Carol
        </ListboxOption>
        <ListboxOption id="person-dora" value={dora}>Dora</ListboxOption>
      </ListboxOptions>
    </Listbox>
  ));
  await settle();

  const button = page.getByRole("button", { name: "Bob" });
  await expect.element(button).toHaveAttribute(
    "aria-labelledby",
    "people-label people-button",
  );
  button.element().focus();
  await userEvent.keyboard("{ArrowDown}");
  await settle();
  const options = page.getByRole("listbox");
  await expect.element(options).toHaveAttribute(
    "aria-activedescendant",
    "person-bob",
  );
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(options).toHaveAttribute(
    "aria-activedescendant",
    "person-dora",
  );
  await userEvent.keyboard("{Enter}");
  await settle();
  await expect.element(page.getByRole("button", { name: "Dora" }))
    .toBeVisible();
  expect(changes.map((person) => person.id)).toEqual([4]);

  await page.getByRole("button", { name: "Dora" }).click();
  await userEvent.keyboard("a");
  await expect.element(options).toHaveAttribute(
    "aria-activedescendant",
    "person-alice",
  );
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByRole("button", { name: "Alice" }))
    .toBeVisible();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("multiple Listbox toggles independently and form reset restores its snapshot", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let form: HTMLFormElement | undefined;
  const changes: Person[][] = [];

  mount(() => (
    <form ref={form}>
      <Listbox
        by="id"
        multiple
        name="people"
        defaultValue={[alice]}
        onChange={(value) => changes.push(value)}
      >
        <ListboxButton>People</ListboxButton>
        <ListboxOptions>
          <ListboxOption value={alice}>Alice multi</ListboxOption>
          <ListboxOption value={bob}>Bob multi</ListboxOption>
        </ListboxOptions>
      </Listbox>
      <button type="reset">Reset people</button>
    </form>
  ));
  await settle();

  await page.getByRole("button", { name: "People", exact: true }).click();
  const list = page.getByRole("listbox");
  await expect.element(list).toHaveAttribute("aria-multiselectable", "true");
  await page.getByRole("option", { name: "Bob multi" }).click();
  await settle();
  await expect.element(list).toBeVisible();
  expect(changes.at(-1)?.map((person) => person.id)).toEqual([1, 2]);
  expect(new FormData(form).get("people[0][id]")).toBe("1");
  expect(new FormData(form).get("people[1][id]")).toBe("2");

  await userEvent.keyboard("{Escape}");
  await settle();
  await page.getByRole("button", { name: "Reset people" }).click();
  await settle();
  expect(new FormData(form).get("people[0][id]")).toBe("1");
  expect(new FormData(form).get("people[1][id]")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("controlled Listbox reports changes without mutating its value", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const changes: Person[] = [];
  let selectExternally = () => {};

  function Example() {
    const [value, setValue] = createSignal<Person>({ ...bob });
    selectExternally = () => setValue({ ...alice });
    return (
      <Listbox
        by="id"
        value={value()}
        onChange={(next) => changes.push(next)}
      >
        <ListboxButton>
          {(slot) => (slot.value as Person).name}
        </ListboxButton>
        <ListboxOptions>
          <ListboxOption value={alice}>Controlled Alice</ListboxOption>
          <ListboxOption value={bob}>Controlled Bob</ListboxOption>
        </ListboxOptions>
      </Listbox>
    );
  }

  mount(() => <Example />);
  await settle();
  await page.getByRole("button", { name: "Bob" }).click();
  await page.getByRole("option", { name: "Controlled Alice" }).click();
  await settle();
  expect(changes.map((person) => person.id)).toEqual([1]);
  await expect.element(page.getByRole("button", { name: "Bob" })).toBeVisible();

  selectExternally();
  await settle();
  await expect.element(page.getByRole("button", { name: "Alice" }))
    .toBeVisible();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Listbox resolves selected identity after a dynamic collection reorder", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let reverse = () => {};

  function Example() {
    const [items, setItems] = createSignal([alice, bob, carol]);
    reverse = () => setItems((current) => current.slice().reverse());
    return (
      <Listbox by="id" defaultValue={{ ...alice }}>
        <ListboxButton>Dynamic person</ListboxButton>
        <ListboxOptions>
          <For each={items()}>
            {(person) => (
              <ListboxOption id={`dynamic-${person.id}`} value={person}>
                {person.name}
              </ListboxOption>
            )}
          </For>
        </ListboxOptions>
      </Listbox>
    );
  }

  mount(() => <Example />);
  await settle();
  reverse();
  await settle();
  await page.getByRole("button", { name: "Dynamic person" }).click();
  await settle();
  const list = page.getByRole("listbox");
  await expect.element(list).toHaveAttribute(
    "aria-activedescendant",
    "dynamic-1",
  );
  expect(document.querySelector("[role=listbox]")?.firstElementChild?.id).toBe(
    "dynamic-3",
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Listbox rekeys a mounted option when its reactive id changes", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let rename = () => {};

  function Example() {
    const [optionId, setOptionId] = createSignal("listbox-reactive-id-old");
    rename = () => setOptionId("listbox-reactive-id-new");

    return (
      <Listbox defaultValue="alpha">
        <ListboxButton id="listbox-reactive-id-trigger">
          Reactive ids
        </ListboxButton>
        <ListboxOptions id="listbox-reactive-id-options" modal={false}>
          <ListboxOption id={optionId()} value="alpha">
            Reactive option
          </ListboxOption>
          <ListboxOption id="listbox-reactive-id-beta" value="beta">
            Beta
          </ListboxOption>
        </ListboxOptions>
      </Listbox>
    );
  }

  mount(() => <Example />);
  await settle();
  await page.getByRole("button", { name: "Reactive ids" }).click();
  await settle();

  rename();
  await settle();
  expect(document.getElementById("listbox-reactive-id-old")).toBeNull();
  document.getElementById("listbox-reactive-id-new")?.focus();
  await settle();
  await expect.element(page.getByRole("listbox")).toHaveAttribute(
    "aria-activedescendant",
    "listbox-reactive-id-new",
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("portal, selection anchor, transition data, and selected projection compose", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <Listbox by="id" defaultValue={{ ...bob }}>
      <ListboxButton id="anchored-button">
        <ListboxSelectedOption
          placeholder="Choose"
          options={
            <>
              <ListboxOption value={alice}>Projected Alice</ListboxOption>
              <ListboxOption value={bob}>Projected Bob</ListboxOption>
            </>
          }
        />
      </ListboxButton>
      <ListboxOptions
        id="anchored-options"
        anchor={{ to: "selection start", gap: 4 }}
        transition
        modal={false}
      >
        <ListboxOption value={alice}>Anchored Alice</ListboxOption>
        <ListboxOption value={bob}>Anchored Bob</ListboxOption>
      </ListboxOptions>
    </Listbox>
  ));
  await settle();
  await expect.element(page.getByRole("button", { name: "Projected Bob" }))
    .toBeVisible();
  expect(host?.textContent).not.toContain("Projected Alice");

  await page.getByRole("button", { name: "Projected Bob" }).click();
  await settle();
  const optionsLocator = page.getByRole("listbox");
  await expect.element(optionsLocator).toBeVisible();
  const options = optionsLocator.element();
  expect(options.closest("#headlessui-portal-root")).not.toBeNull();
  expect(options.getAttribute("data-anchor")?.startsWith("selection")).toBe(
    true,
  );
  expect(options.style.getPropertyValue("--button-width")).not.toBe("");
  await page.getByRole("option", { name: "Anchored Alice" }).click();
  await settle();
  await expect.element(page.getByRole("button", { name: "Projected Alice" }))
    .toBeVisible();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("string anchors resolve CSS variable gap, offset, and padding", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <style>
        {`
          #css-anchor-options {
            --anchor-gap: 8px;
            --anchor-offset: -4px;
            --anchor-padding: 2px;
            width: 120px;
            height: 50px;
          }
        `}
      </style>
      <Listbox defaultValue="alice">
        <ListboxButton
          ref={(element) => {
            element.getBoundingClientRect = () => new DOMRect(100, 100, 80, 30);
          }}
        >
          CSS anchor
        </ListboxButton>
        <ListboxOptions
          id="css-anchor-options"
          anchor="bottom start"
          modal={false}
          ref={(element) => {
            element.getBoundingClientRect = () => new DOMRect(0, 0, 120, 50);
          }}
        >
          <ListboxOption value="alice">Alice</ListboxOption>
        </ListboxOptions>
      </Listbox>
    </>
  ));
  await settle();

  await page.getByRole("button", { name: "CSS anchor" }).click();
  const options = page.getByRole("listbox").element() as HTMLElement;
  await expect.poll(() => ({
    anchor: options.getAttribute("data-anchor"),
    left: options.style.left,
    top: options.style.top,
  })).toEqual({
    anchor: "bottom start",
    left: "96px",
    top: "138px",
  });
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("ListboxOptions can move into and out of a portal while open", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let enablePortal = () => {};
  let disablePortal = () => {};

  function Example() {
    const [portalled, setPortalled] = createSignal(false);
    enablePortal = () => setPortalled(true);
    disablePortal = () => setPortalled(false);
    return (
      <Listbox defaultValue="alice">
        <ListboxButton>Dynamic portal</ListboxButton>
        <ListboxOptions
          id="dynamic-portal-options"
          portal={portalled()}
          modal={false}
        >
          <ListboxOption value="alice">Portal Alice</ListboxOption>
          <ListboxOption value="bob">Portal Bob</ListboxOption>
        </ListboxOptions>
      </Listbox>
    );
  }

  mount(() => <Example />);
  await settle();
  await page.getByRole("button", { name: "Dynamic portal" }).click();
  await settle();
  const options = document.getElementById("dynamic-portal-options");
  expect(options).not.toBeNull();
  expect(
    options?.closest("#headlessui-portal-root"),
  ).toBeNull();

  enablePortal();
  await settle();
  expect(
    document.getElementById("dynamic-portal-options")?.closest(
      "#headlessui-portal-root",
    ),
  ).not.toBeNull();

  disablePortal();
  await settle();
  expect(
    document.getElementById("dynamic-portal-options")?.closest(
      "#headlessui-portal-root",
    ),
  ).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Listbox opening, orientation, boundary aliases, selection, and Tab traversal form a keyboard matrix", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <button id="before-listbox" type="button">Before listbox</button>
      <Listbox>
        <ListboxButton id="vertical-trigger">Vertical matrix</ListboxButton>
        <ListboxOptions id="vertical-options" modal={false}>
          <ListboxOption id="vertical-alpha" value="alpha">
            Alpha vertical
          </ListboxOption>
          <ListboxOption id="vertical-disabled" value="disabled" disabled>
            Disabled vertical
          </ListboxOption>
          <ListboxOption id="vertical-gamma" value="gamma">
            Gamma vertical
          </ListboxOption>
        </ListboxOptions>
      </Listbox>
      <button id="after-listbox" type="button">After listbox</button>
      <Listbox horizontal>
        <ListboxButton id="horizontal-trigger">Horizontal matrix</ListboxButton>
        <ListboxOptions id="horizontal-options" modal={false}>
          <ListboxOption id="horizontal-alpha" value="alpha">
            Alpha horizontal
          </ListboxOption>
          <ListboxOption id="horizontal-disabled" value="disabled" disabled>
            Disabled horizontal
          </ListboxOption>
          <ListboxOption id="horizontal-gamma" value="gamma">
            Gamma horizontal
          </ListboxOption>
        </ListboxOptions>
      </Listbox>
    </>
  ));
  await settle();

  const verticalTrigger = page.getByRole("button", { name: "Vertical matrix" });
  verticalTrigger.element().focus();
  await userEvent.keyboard("{ArrowUp}");
  await settle();
  let options = page.getByRole("listbox");
  await expect.element(options).toHaveAttribute(
    "aria-activedescendant",
    "vertical-gamma",
  );
  await userEvent.keyboard("{PageUp}");
  await expect.element(options).toHaveAttribute(
    "aria-activedescendant",
    "vertical-alpha",
  );
  await userEvent.keyboard("{PageDown}{ArrowDown}");
  await expect.element(options).toHaveAttribute(
    "aria-activedescendant",
    "vertical-gamma",
  );
  await userEvent.keyboard(" ");
  await settle();
  expect(document.getElementById("vertical-options")).toBeNull();

  await verticalTrigger.click();
  await settle();
  await userEvent.keyboard("{Tab}");
  expect(document.getElementById("vertical-options")).toBeNull();
  expect(document.activeElement?.id).toBe("after-listbox");
  verticalTrigger.element().focus();
  await verticalTrigger.click();
  await settle();
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  expect(document.getElementById("vertical-options")).toBeNull();
  expect(document.activeElement?.id).toBe("before-listbox");

  const horizontalTrigger = page.getByRole("button", {
    name: "Horizontal matrix",
  });
  await horizontalTrigger.click();
  await settle();
  options = page.getByRole("listbox");
  await expect.element(options).toHaveAttribute(
    "aria-orientation",
    "horizontal",
  );
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(options).toHaveAttribute(
    "aria-activedescendant",
    "horizontal-alpha",
  );
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(options).toHaveAttribute(
    "aria-activedescendant",
    "horizontal-gamma",
  );
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(options).toHaveAttribute(
    "aria-activedescendant",
    "horizontal-gamma",
  );
  await userEvent.keyboard("{ArrowLeft}{Escape}");
  await settle();
  expect(document.getElementById("horizontal-options")).toBeNull();
  expect(document.activeElement?.id).toBe("horizontal-trigger");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Listbox render props, polymorphism, button types, comparators, and external form values compose", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <form id="external-listbox-form" />
      <Listbox
        as="section"
        id="contract-listbox"
        by={(left: Person, right: Person) => left.id === right.id}
        defaultValue={{ ...alice }}
        form="external-listbox-form"
        name="person"
        invalid
      >
        {(root) => (
          <>
            <output id="listbox-root-state">
              {`${root.open}:${root.invalid}:${root.value.name}`}
            </output>
            <ListboxLabel as="p" id="contract-label">
              Contract person
            </ListboxLabel>
            <ListboxButton
              id="contract-listbox-trigger"
              class={(slot) => ({ open: slot.open, invalid: slot.invalid })}
            >
              {(slot) => (slot.value as Person).name}
            </ListboxButton>
            <ListboxOptions id="contract-listbox-options" modal={false} static>
              <ListboxOption
                id="contract-alice"
                value={{ ...alice }}
                class={(slot) =>
                  slot.selected ? "selected-option" : "idle-option"}
              >
                Contract Alice
              </ListboxOption>
              <ListboxOption id="contract-bob" value={{ ...bob }}>
                Contract Bob
              </ListboxOption>
            </ListboxOptions>
          </>
        )}
      </Listbox>
      <Listbox defaultValue="explicit">
        <ListboxButton id="explicit-listbox-trigger" type="submit">
          Explicit listbox submit
        </ListboxButton>
        <ListboxOptions static>
          <ListboxOption value="explicit">Explicit value</ListboxOption>
        </ListboxOptions>
      </Listbox>
      <Listbox defaultValue="div">
        <ListboxButton as="div" id="div-listbox-trigger">
          Div listbox trigger
        </ListboxButton>
        <ListboxOptions static>
          <ListboxOption value="div">Div value</ListboxOption>
        </ListboxOptions>
      </Listbox>
    </>
  ));
  await settle();

  expect(document.getElementById("contract-listbox")?.tagName).toBe("SECTION");
  expect(document.getElementById("contract-label")?.tagName).toBe("P");
  expect(
    document.getElementById("contract-listbox-trigger")?.getAttribute("type"),
  )
    .toBe("button");
  expect(
    document.getElementById("contract-listbox-trigger")?.classList.contains(
      "invalid",
    ),
  )
    .toBe(true);
  expect(
    document.getElementById("contract-alice")?.classList.contains(
      "selected-option",
    ),
  )
    .toBe(true);
  expect(
    document.getElementById("explicit-listbox-trigger")?.getAttribute("type"),
  )
    .toBe("submit");
  expect(document.getElementById("div-listbox-trigger")?.tagName).toBe("DIV");
  expect(document.getElementById("div-listbox-trigger")?.hasAttribute("type"))
    .toBe(false);

  const externalForm = document.getElementById(
    "external-listbox-form",
  ) as HTMLFormElement;
  let data = new FormData(externalForm);
  expect(data.get("person[id]")).toBe("1");
  expect(data.get("person[name]")).toBe("Alice");
  await page.getByRole("option", { name: "Contract Bob" }).click();
  await settle();
  data = new FormData(externalForm);
  expect(data.get("person[id]")).toBe("2");
  expect(data.get("person[name]")).toBe("Bob");
  expect(document.getElementById("listbox-root-state")?.textContent).toContain(
    "false:true:Bob",
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Listbox label, focus, pointer movement, leave, disabled, outside, and sibling cases compose", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  mount(() => (
    <>
      <button id="listbox-focusable-ancestor" type="button">
        <span>Listbox outside child</span>
      </button>
      <Listbox defaultValue="beta">
        <ListboxLabel id="pointer-listbox-label">Pointer choice</ListboxLabel>
        <ListboxButton id="pointer-listbox-trigger">
          Pointer listbox
        </ListboxButton>
        <ListboxOptions id="pointer-listbox-options" modal={false}>
          <ListboxOption id="pointer-listbox-alpha" value="alpha">
            Pointer alpha
          </ListboxOption>
          <ListboxOption id="pointer-listbox-beta" value="beta">
            Pointer beta
          </ListboxOption>
          <ListboxOption
            id="pointer-listbox-disabled"
            value="disabled"
            disabled
          >
            Pointer disabled
          </ListboxOption>
        </ListboxOptions>
      </Listbox>
      <Listbox disabled>
        <ListboxButton id="disabled-listbox-trigger">
          Disabled listbox trigger
        </ListboxButton>
        <ListboxOptions static>
          <ListboxOption value="never">Never</ListboxOption>
        </ListboxOptions>
      </Listbox>
      <Listbox>
        <ListboxButton id="sibling-listbox-trigger">
          Sibling listbox
        </ListboxButton>
        <ListboxOptions id="sibling-listbox-options" modal={false}>
          <ListboxOption value="sibling">Sibling option</ListboxOption>
        </ListboxOptions>
      </Listbox>
    </>
  ));
  await settle();

  await page.getByText("Pointer choice").click();
  expect(document.activeElement?.id).toBe("pointer-listbox-trigger");
  document.getElementById("listbox-focusable-ancestor")?.focus();
  document.getElementById("pointer-listbox-label")?.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, button: 2 }),
  );
  expect(document.activeElement?.id).toBe("listbox-focusable-ancestor");
  document.getElementById("pointer-listbox-trigger")?.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, button: 2 }),
  );
  expect(document.getElementById("pointer-listbox-options")).toBeNull();
  document.getElementById("disabled-listbox-trigger")?.click();
  expect(
    document.getElementById("disabled-listbox-trigger")?.getAttribute(
      "aria-expanded",
    ),
  ).toBe("false");

  document.getElementById("pointer-listbox-trigger")?.click();
  await settle();
  const options = document.getElementById("pointer-listbox-options")!;
  expect(options.getAttribute("aria-activedescendant")).toBe(
    "pointer-listbox-beta",
  );
  const alphaOption = document.getElementById("pointer-listbox-alpha")!;
  const disabledOption = document.getElementById("pointer-listbox-disabled")!;
  alphaOption.focus();
  flush();
  expect(options.getAttribute("aria-activedescendant")).toBe(
    "pointer-listbox-alpha",
  );
  disabledOption.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  flush();
  expect(options.hasAttribute("aria-activedescendant")).toBe(false);
  alphaOption.dispatchEvent(
    new MouseEvent("mouseenter", { bubbles: true, clientX: 1, clientY: 1 }),
  );
  alphaOption.dispatchEvent(
    new MouseEvent("mousemove", { bubbles: true, clientX: 2, clientY: 2 }),
  );
  flush();
  expect(options.getAttribute("aria-activedescendant")).toBe(
    "pointer-listbox-alpha",
  );
  alphaOption.dispatchEvent(
    new MouseEvent("mousemove", { bubbles: true, clientX: 2, clientY: 2 }),
  );
  alphaOption.dispatchEvent(
    new MouseEvent("mouseleave", { bubbles: true, clientX: 3, clientY: 3 }),
  );
  flush();
  expect(options.hasAttribute("aria-activedescendant")).toBe(false);
  disabledOption.dispatchEvent(
    new MouseEvent("mousemove", { bubbles: true, clientX: 4, clientY: 4 }),
  );
  disabledOption.dispatchEvent(
    new MouseEvent("mouseleave", { bubbles: true, clientX: 5, clientY: 5 }),
  );
  disabledOption.click();
  expect(document.getElementById("pointer-listbox-options")).not.toBeNull();

  document.getElementById("sibling-listbox-trigger")?.click();
  await settle();
  expect(document.getElementById("pointer-listbox-options")).toBeNull();
  expect(document.getElementById("sibling-listbox-options")).not.toBeNull();
  document.getElementById("sibling-listbox-trigger")?.click();
  await settle();
  expect(document.getElementById("sibling-listbox-options")).toBeNull();
  document.getElementById("sibling-listbox-trigger")?.click();
  await settle();
  await page.getByText("Listbox outside child").click();
  expect(document.getElementById("sibling-listbox-options")).toBeNull();
  await page.getByText("Listbox outside child").click();
  expect(document.getElementById("sibling-listbox-options")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to disable a Listbox and expose its disabled root slot", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Listbox disabled>
      {(slot) => (
        <>
          <output id="disabled-root-slot">{String(slot.disabled)}</output>
          <ListboxButton id="disabled-root-button">Disabled root</ListboxButton>
          <ListboxOptions id="disabled-root-options">
            <ListboxOption value="alpha">Disabled root option</ListboxOption>
          </ListboxOptions>
        </>
      )}
    </Listbox>
  ));
  await settle();

  expect(document.getElementById("disabled-root-slot")?.textContent).toBe(
    "true",
  );
  document.getElementById("disabled-root-button")?.click();
  document.getElementById("disabled-root-button")?.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
  );
  expect(document.getElementById("disabled-root-options")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to use the by prop (as a string) with a null initial value", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  function NullableInitial() {
    const [value, setValue] = createSignal<Person | null>(null);
    return (
      <Listbox value={value()} onChange={setValue} by="id">
        <ListboxButton>Nullable initial</ListboxButton>
        <ListboxOptions id="nullable-initial-options" modal={false}>
          <ListboxOption value={alice}>Nullable Alice</ListboxOption>
          <ListboxOption value={bob}>Nullable Bob</ListboxOption>
          <ListboxOption value={carol}>Nullable Carol</ListboxOption>
        </ListboxOptions>
      </Listbox>
    );
  }

  mount(() => <NullableInitial />);
  await settle();
  await page.getByRole("button", { name: "Nullable initial" }).click();
  for (const name of ["Nullable Alice", "Nullable Bob", "Nullable Carol"]) {
    await expect.element(page.getByRole("option", { name })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  }
  await page.getByRole("option", { name: "Nullable Carol" }).click();
  await page.getByRole("button", { name: "Nullable initial" }).click();
  await expect.element(page.getByRole("option", { name: "Nullable Carol" }))
    .toHaveAttribute("aria-selected", "true");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to use the by prop (as a string) with a null listbox option", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Listbox
      value={null as Person | null}
      onChange={(_value: Person | null) => {}}
      by="id"
    >
      <ListboxButton>Nullable option</ListboxButton>
      <ListboxOptions modal={false}>
        <ListboxOption value={null} disabled>Null placeholder</ListboxOption>
        <ListboxOption value={alice}>Nullable option Alice</ListboxOption>
      </ListboxOptions>
    </Listbox>
  ));
  await settle();
  await page.getByRole("button", { name: "Nullable option" }).click();
  await expect.element(page.getByRole("option", { name: "Null placeholder" }))
    .toHaveAttribute("aria-selected", "true");
  await expect.element(
    page.getByRole("option", { name: "Nullable option Alice" }),
  )
    .toHaveAttribute("aria-selected", "false");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("null should be a valid value for the Listbox", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Listbox
      value={null as string | null}
      onChange={(_value: string | null) => {}}
    >
      <ListboxButton>Null value contract</ListboxButton>
      <ListboxOptions id="null-value-options" modal={false}>
        <ListboxOption value="alpha">Null contract alpha</ListboxOption>
      </ListboxOptions>
    </Listbox>
  ));
  await page.getByRole("button", { name: "Null value contract" }).click();
  expect(document.getElementById("null-value-options")).not.toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to render a Listbox.Label using a render prop", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Listbox>
      <ListboxLabel id="label-render-prop">
        {(slot) => `${slot.open}:${slot.disabled}`}
      </ListboxLabel>
      <ListboxButton>Label render prop</ListboxButton>
      <ListboxOptions modal={false}>
        <ListboxOption value="a">A</ListboxOption>
      </ListboxOptions>
    </Listbox>
  ));
  expect(document.getElementById("label-render-prop")?.textContent).toBe(
    "false:false",
  );
  await page.getByRole("button", { name: "Label render prop" }).click();
  expect(document.getElementById("label-render-prop")?.textContent).toBe(
    "true:false",
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to render a Listbox.Label using a render prop and an `as` prop", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Listbox>
      <ListboxLabel as="p" id="label-render-as">
        {(slot) => `${slot.open}:${slot.disabled}`}
      </ListboxLabel>
      <ListboxButton>Label render-as</ListboxButton>
      <ListboxOptions modal={false}>
        <ListboxOption value="a">A</ListboxOption>
      </ListboxOptions>
    </Listbox>
  ));
  expect(document.getElementById("label-render-as")?.tagName).toBe("P");
  expect(document.getElementById("label-render-as")?.textContent).toBe(
    "false:false",
  );
  await page.getByRole("button", { name: "Label render-as" }).click();
  expect(document.getElementById("label-render-as")?.textContent).toBe(
    "true:false",
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to render a Listbox.Button using a render prop and an `as` prop", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Listbox defaultValue="a">
      <ListboxButton as={ListboxForwardButton} id="listbox-button-render-as">
        {(slot) => slot.open ? "Close button render-as" : `Open ${slot.value}`}
      </ListboxButton>
      <ListboxOptions id="listbox-button-render-as-options" modal={false}>
        <ListboxOption value="a">Render-as A</ListboxOption>
      </ListboxOptions>
    </Listbox>
  ));
  const trigger = page.getByRole("button", { name: "Open a" });
  await trigger.click();
  await expect.element(
    page.getByRole("button", { name: "Close button render-as" }),
  )
    .toBeVisible();
  expect(document.getElementById("listbox-button-render-as-options")).not
    .toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test('should set the `type` to "button" when Listbox `as` resolves to a "button"', () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Listbox>
      <ListboxButton as={ListboxForwardButton} id="listbox-custom-button">
        Custom listbox button
      </ListboxButton>
      <ListboxOptions static>
        <ListboxOption value="a">A</ListboxOption>
      </ListboxOptions>
    </Listbox>
  ));
  expect(document.getElementById("listbox-custom-button")?.getAttribute("type"))
    .toBe("button");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test('should not set the `type` to "button" when Listbox `as` resolves to a "div"', () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Listbox>
      <ListboxButton as={ListboxForwardDiv} id="listbox-custom-div">
        Custom listbox div
      </ListboxButton>
      <ListboxOptions static>
        <ListboxOption value="a">A</ListboxOption>
      </ListboxOptions>
    </Listbox>
  ));
  expect(document.getElementById("listbox-custom-div")?.tagName).toBe("DIV");
  expect(document.getElementById("listbox-custom-div")?.hasAttribute("type"))
    .toBe(false);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to render a ListboxButton using as={Fragment} [Solid explicit-target adaptation]", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Listbox>
      <ListboxButton as={ListboxForwardButton} id="listbox-fragment-adapter">
        Adapted Listbox Fragment
      </ListboxButton>
      <ListboxOptions id="listbox-fragment-options" modal={false}>
        <ListboxOption value="a">Adapted option</ListboxOption>
      </ListboxOptions>
    </Listbox>
  ));
  await page.getByRole("button", { name: "Adapted Listbox Fragment" }).click();
  expect(document.getElementById("listbox-fragment-options")).not.toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to render Listbox.Options using a render prop", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Listbox>
      <ListboxButton>Options render prop</ListboxButton>
      <ListboxOptions id="options-render-prop" modal={false}>
        {(slot) => (
          <ListboxOption value="a">
            {slot.open ? "Options are open" : "Options are closed"}
          </ListboxOption>
        )}
      </ListboxOptions>
    </Listbox>
  ));
  await page.getByRole("button", { name: "Options render prop" }).click();
  expect(document.getElementById("options-render-prop")?.textContent).toContain(
    "Options are open",
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to swap the Listbox option with a button for example", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Listbox>
      <ListboxButton>Button options</ListboxButton>
      <ListboxOptions modal={false}>
        <ListboxOption as="button" value="a">Button option A</ListboxOption>
        <ListboxOption as="button" value="b">Button option B</ListboxOption>
      </ListboxOptions>
    </Listbox>
  ));
  await page.getByRole("button", { name: "Button options" }).click();
  for (const option of document.querySelectorAll("[role=option]")) {
    expect(option.tagName).toBe("BUTTON");
  }
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to wrap the Listbox.Options with a Transition component", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Listbox>
      <ListboxButton>Transition-wrapped listbox</ListboxButton>
      <Transition as="div" transition={false}>
        <ListboxOptions id="transition-wrapped-listbox" modal={false}>
          <ListboxOption value="a">Wrapped option</ListboxOption>
        </ListboxOptions>
      </Transition>
    </Listbox>
  ));
  const trigger = page.getByRole("button", {
    name: "Transition-wrapped listbox",
  });
  await trigger.click();
  expect(document.getElementById("transition-wrapped-listbox")).not.toBeNull();
  await trigger.click();
  expect(document.getElementById("transition-wrapped-listbox")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should be possible to submit a form by pressing enter", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const submissions: Array<Array<[string, FormDataEntryValue]>> = [];
  mount(() => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submissions.push([...new FormData(event.currentTarget).entries()]);
      }}
    >
      <Listbox name="delivery">
        <ListboxButton id="enter-submit-listbox">
          Enter-submit listbox
        </ListboxButton>
        <ListboxOptions modal={false}>
          <ListboxOption value="home-delivery">
            Enter home delivery
          </ListboxOption>
        </ListboxOptions>
      </Listbox>
      <button type="submit">Submit delivery</button>
    </form>
  ));
  await settle();
  document.getElementById("enter-submit-listbox")?.focus();
  await userEvent.keyboard("{Enter}");
  expect(submissions.at(-1)).toEqual([]);
  await page.getByRole("button", { name: "Enter-submit listbox" }).click();
  await page.getByRole("option", { name: "Enter home delivery" }).click();
  document.getElementById("enter-submit-listbox")?.focus();
  await userEvent.keyboard("{Enter}");
  expect(submissions.at(-1)).toEqual([["delivery", "home-delivery"]]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("should not submit the data if the Listbox is disabled", () => {
  const diagnostics = DEV?.diagnostics.capture();
  let form: HTMLFormElement | undefined;
  mount(() => (
    <form ref={form}>
      <input type="hidden" name="foo" value="bar" />
      <Listbox name="delivery" value="home-delivery" disabled>
        <ListboxButton>Disabled delivery</ListboxButton>
        <ListboxOptions static>
          <ListboxOption value="home-delivery">Home delivery</ListboxOption>
        </ListboxOptions>
      </Listbox>
    </form>
  ));
  expect([...new FormData(form).entries()]).toEqual([["foo", "bar"]]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
