import { render } from "@solidjs/web";
import { createSignal, DEV, type Element, flush, For } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxLabel,
  ComboboxOption,
  ComboboxOptions,
} from "../src/components/combobox/combobox.tsx";

interface Person {
  disabled?: boolean;
  id: number;
  name: string;
}

const alice: Person = { id: 1, name: "Alice" };
const bob: Person = { id: 2, name: "Bob" };
const carol: Person = { disabled: true, id: 3, name: "Carol" };
const dora: Person = { id: 4, name: "Dora" };

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

function mount(children: () => Element): void {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(children, host);
  flush();
}

async function settle(frames = 1): Promise<void> {
  flush();
  await Promise.resolve();
  for (let frame = 0; frame < frames; frame++) {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
  }
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

test("keyboard selection, disabled skipping, displayValue, labels, and ARIA compose", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const changes: Person[] = [];
  mount(() => (
    <Combobox<Person>
      by="id"
      defaultValue={{ ...bob }}
      onChange={(value) => value && changes.push(value)}
    >
      <ComboboxLabel id="people-label">Person</ComboboxLabel>
      <ComboboxInput<Person>
        id="people-input"
        displayValue={(person) => person?.name ?? ""}
      />
      <ComboboxButton id="people-button">Toggle</ComboboxButton>
      <ComboboxOptions id="people-options" modal={false}>
        <ComboboxOption id="person-alice" value={alice}>Alice</ComboboxOption>
        <ComboboxOption id="person-bob" value={bob}>Bob</ComboboxOption>
        <ComboboxOption id="person-carol" value={carol} disabled>
          Carol
        </ComboboxOption>
        <ComboboxOption id="person-dora" value={dora}>Dora</ComboboxOption>
      </ComboboxOptions>
    </Combobox>
  ));
  await settle();

  const input = page.getByRole("combobox");
  expect((input.element() as HTMLInputElement).value).toBe("Bob");
  await expect.element(input).toHaveAttribute(
    "aria-labelledby",
    "people-label",
  );
  await page.getByRole("button", { name: "Toggle" }).click();
  await settle();
  expect(document.activeElement?.id).toBe("people-input");
  await expect.element(input).toHaveAttribute("aria-expanded", "true");
  await expect.element(input).toHaveAttribute(
    "aria-activedescendant",
    "person-bob",
  );
  const listbox = page.getByRole("listbox");
  await expect.element(listbox).toHaveAttribute(
    "aria-labelledby",
    "people-label people-button",
  );
  await expect.element(page.getByRole("option", { name: "Bob" }))
    .toHaveAttribute("aria-selected", "true");

  await userEvent.keyboard("{ArrowDown}");
  await expect.element(input).toHaveAttribute(
    "aria-activedescendant",
    "person-dora",
  );
  await userEvent.keyboard("{Enter}");
  await settle();
  expect(document.getElementById("people-options")).toBeNull();
  expect((input.element() as HTMLInputElement).value).toBe("Dora");
  expect(changes.map((person) => person.id)).toEqual([4]);
  expect(document.activeElement?.id).toBe("people-input");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("query input composes native handlers, filters reactively, and Escape restores selection", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const calls: string[] = [];
  let selected: Person | null = bob;
  const [query, setQuery] = createSignal("");
  const [value, setValue] = createSignal<Person | null>(bob);
  const people = [alice, bob, carol, dora];
  const filtered = () =>
    query() === ""
      ? people
      : people.filter((person) =>
        person.name.toLowerCase().includes(query().toLowerCase())
      );

  mount(() => (
    <Combobox<Person>
      by="id"
      value={value() ?? undefined}
      onChange={(next) => {
        selected = next;
        setValue(next);
      }}
    >
      <ComboboxInput<Person>
        id="query-input"
        displayValue={(person) => person?.name ?? ""}
        onInput={() => calls.push("input")}
        onChange={(event) => {
          calls.push("change");
          setQuery(event.currentTarget.value);
        }}
      />
      <ComboboxButton>Search</ComboboxButton>
      <ComboboxOptions modal={false}>
        <For each={filtered()}>
          {(person) => (
            <ComboboxOption id={`query-${person.id}`} value={person}>
              {person.name}
            </ComboboxOption>
          )}
        </For>
      </ComboboxOptions>
    </Combobox>
  ));
  await settle();
  const input = page.getByRole("combobox");
  input.element().focus();
  await userEvent.keyboard("{Control>}a{/Control}bo");
  await settle();
  expect(calls).toEqual(["input", "change", "input", "change"]);
  await expect.element(page.getByRole("option", { name: "Bob" })).toBeVisible();
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  await userEvent.keyboard("{Home}{Enter}");
  await settle();
  expect(selected?.id).toBe(2);

  await page.getByRole("button", { name: "Search" }).click();
  await userEvent.keyboard("{Control>}a{/Control}x");
  await settle();
  expect((input.element() as HTMLInputElement).value).toBe("x");
  await userEvent.keyboard("{Escape}");
  await settle();
  expect((input.element() as HTMLInputElement).value).toBe("Bob");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("selected value synchronization preserves a custom input selection", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <Combobox defaultValue="bob">
      <ComboboxInput
        onFocus={(event) => {
          event.currentTarget.select();
          event.currentTarget.setSelectionRange(
            0,
            event.currentTarget.value.length,
          );
        }}
      />
      <ComboboxButton>Selection</ComboboxButton>
      <ComboboxOptions modal={false}>
        <ComboboxOption value="alice">alice</ComboboxOption>
        <ComboboxOption value="bob">bob</ComboboxOption>
        <ComboboxOption value="charlie">charlie</ComboboxOption>
      </ComboboxOptions>
    </Combobox>
  ));
  await settle();

  await page.getByRole("button", { name: "Selection" }).click();
  await page.getByRole("option", { exact: true, name: "charlie" }).click();
  await settle(2);

  const input = page.getByRole("combobox").element() as HTMLInputElement;
  expect(input.value).toBe("charlie");
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe("charlie".length);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test.each(["dom", "virtual"] as const)(
  "%s mode closes and transfers focus on an outside pointer click",
  async (mode) => {
    const diagnostics = DEV?.diagnostics.capture();
    const options = ["Option A", "Option B", "Option C"];
    mount(() => (
      <>
        <Combobox<string>
          value="test"
          virtual={mode === "virtual" ? { options } : null}
        >
          <ComboboxInput />
          <ComboboxButton>Trigger</ComboboxButton>
          <ComboboxOptions<string>
            modal={false}
            style={mode === "virtual"
              ? { height: "120px", overflow: "auto" }
              : undefined}
          >
            {mode === "virtual"
              ? (slot) =>
                slot.option && (
                  <ComboboxOption value={slot.option}>
                    {slot.option}
                  </ComboboxOption>
                )
              : (
                <For each={options}>
                  {(option) => (
                    <ComboboxOption value={option}>{option}</ComboboxOption>
                  )}
                </For>
              )}
          </ComboboxOptions>
        </Combobox>
        <div data-testid={`${mode}-outside`} tabindex={-1}>after</div>
      </>
    ));
    await settle();

    const input = page.getByRole("combobox");
    await page.getByRole("button", { name: "Trigger" }).click();
    await settle();
    await expect.element(page.getByRole("listbox")).toBeVisible();
    expect(document.activeElement).toBe(input.element());

    const outside = page.getByTestId(`${mode}-outside`);
    await outside.click();
    await settle();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(outside.element());
    expect(diagnostics?.stop() ?? []).toEqual([]);
  },
);

test("uncontrolled multiple values, comparator identity, form serialization, and reset compose", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const changes: Person[][] = [];
  mount(() => (
    <form id="people-form">
      <Combobox<Person, true>
        multiple
        by="id"
        defaultValue={[{ ...alice }]}
        name="people"
        onChange={(next) => changes.push(next)}
      >
        {(slot) => (
          <>
            <output id="multiple-value">
              {slot.value.map((person) => person.name).join(",")}
            </output>
            <ComboboxInput<Person[]>
              displayValue={(people) =>
                people.map((person) => person.name).join(",")}
            />
            <ComboboxButton>Multiple</ComboboxButton>
            <ComboboxOptions modal={false}>
              <ComboboxOption value={alice}>Alice</ComboboxOption>
              <ComboboxOption value={bob}>Bob</ComboboxOption>
              <ComboboxOption value={dora}>Dora</ComboboxOption>
            </ComboboxOptions>
          </>
        )}
      </Combobox>
    </form>
  ));
  await settle();
  await page.getByRole("button", { name: "Multiple" }).click();
  await page.getByRole("option", { name: "Bob" }).click();
  await settle();
  await expect.element(page.getByRole("listbox")).toBeVisible();
  expect(document.getElementById("multiple-value")?.textContent).toBe(
    "Alice,Bob",
  );
  const form = document.getElementById("people-form") as HTMLFormElement;
  expect([...new FormData(form).entries()]).toEqual([
    ["people[0][id]", "1"],
    ["people[0][name]", "Alice"],
    ["people[1][id]", "2"],
    ["people[1][name]", "Bob"],
  ]);
  form.reset();
  await settle();
  expect(document.getElementById("multiple-value")?.textContent).toBe("Alice");
  expect(changes.at(-1)?.map((person) => person.id)).toEqual([1]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("immediate focus, pointer activation, disabled options, outside click, and sibling stacking compose", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const changes: string[] = [];
  mount(() => (
    <>
      <Combobox immediate onChange={(value) => value && changes.push(value)}>
        <ComboboxInput id="first-input" />
        <ComboboxButton>First</ComboboxButton>
        <ComboboxOptions id="first-options" hold modal={false}>
          <ComboboxOption id="disabled-option" value="disabled" disabled>
            Disabled
          </ComboboxOption>
          <ComboboxOption id="enabled-option" value="enabled">
            Enabled
          </ComboboxOption>
        </ComboboxOptions>
      </Combobox>
      <Combobox>
        <ComboboxInput id="second-input" />
        <ComboboxButton>Second</ComboboxButton>
        <ComboboxOptions id="second-options" modal={false}>
          <ComboboxOption value="second">Second option</ComboboxOption>
        </ComboboxOptions>
      </Combobox>
      <button id="outside" type="button">Outside</button>
    </>
  ));
  await settle();

  document.getElementById("first-input")?.focus();
  await settle(2);
  await expect.element(page.getByRole("listbox")).toBeVisible();
  const disabledOption = page.getByRole("option", { name: "Disabled" });
  await disabledOption.hover();
  await expect.element(disabledOption).not.toHaveAttribute("data-focus");
  disabledOption.element().dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
    }),
  );
  await settle();
  expect(changes).toEqual([]);
  const enabled = page.getByRole("option", { name: "Enabled" });
  await enabled.hover();
  await expect.element(enabled).toHaveAttribute("data-focus", "");

  await page.getByRole("button", { name: "Second" }).click();
  await settle();
  expect(document.getElementById("first-options")).toBeNull();
  expect(document.getElementById("second-options")).not.toBeNull();
  await page.getByRole("button", { name: "Outside" }).click();
  await settle();
  expect(document.getElementById("second-options")).toBeNull();
  expect(document.activeElement?.id).toBe("outside");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("anchor auto-portals, width variables, transition leave, and render strategies compose", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <>
      <style>
        {`
          #anchored-options {
            --anchor-gap: 8px;
            --anchor-offset: 4px;
            --anchor-padding: 2px;
            width: 120px;
            height: 50px;
            transition-property: opacity;
            transition-duration: 140ms;
          }
          #anchored-options[data-closed] { opacity: 0; }
        `}
      </style>
      <Combobox>
        <ComboboxInput
          id="anchor-input"
          ref={(element) => {
            element.getBoundingClientRect = () => new DOMRect(100, 100, 90, 30);
          }}
        />
        <ComboboxButton
          ref={(element) => {
            element.getBoundingClientRect = () => new DOMRect(160, 100, 30, 30);
          }}
        >
          Anchored
        </ComboboxButton>
        <ComboboxOptions
          id="anchored-options"
          modal={false}
          transition
          anchor="bottom end"
          ref={(element) => {
            element.getBoundingClientRect = () => new DOMRect(0, 0, 120, 50);
          }}
        >
          <ComboboxOption value="action">Action</ComboboxOption>
        </ComboboxOptions>
      </Combobox>
      <Combobox>
        <ComboboxInput />
        <ComboboxOptions id="retained-options" unmount={false}>
          <ComboboxOption value="retained">Retained</ComboboxOption>
        </ComboboxOptions>
      </Combobox>
    </>
  ));
  await settle();
  expect(document.getElementById("retained-options")?.hidden).toBe(true);
  expect(document.getElementById("retained-options")?.style.display).toBe(
    "none",
  );

  const trigger = page.getByRole("button", { name: "Anchored" });
  await trigger.click();
  const options = page.getByRole("listbox");
  await expect.poll(() => options.element().getAttribute("data-anchor"))
    .toBe("bottom end");
  const element = options.element() as HTMLElement;
  await expect.poll(() => ({
    buttonWidth: element.style.getPropertyValue("--button-width"),
    inputWidth: element.style.getPropertyValue("--input-width"),
    left: element.style.left,
    position: element.style.position,
    top: element.style.top,
  })).toEqual({
    buttonWidth: "30px",
    inputWidth: "90px",
    left: "74px",
    position: "absolute",
    top: "138px",
  });
  await expect.element(options, { timeout: 2_000 })
    .not.toHaveAttribute("data-transition");
  await trigger.click();
  await expect.element(options).toHaveAttribute("data-leave", "");
  await expect.poll(() => document.getElementById("anchored-options"), {
    timeout: 2_000,
  }).toBeNull();
  expect(document.activeElement?.id).toBe("anchor-input");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("virtual mode measures rows, windows options, scrolls active indices, and replaces values reactively", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const initial = Array.from({ length: 100 }, (_, index) => ({
    id: index,
    name: `Person ${index}`,
  }));
  const [people, setPeople] = createSignal<Person[]>(initial);
  mount(() => (
    <Combobox<Person>
      by="id"
      virtual={{ options: people() }}
      value={{ ...initial[0] }}
    >
      <ComboboxInput />
      <ComboboxButton>Virtual</ComboboxButton>
      <ComboboxOptions<Person>
        id="virtual-options"
        modal={false}
        style={{ height: "120px", overflow: "auto", padding: "10px 0" }}
      >
        {({ option }) =>
          option && (
            <ComboboxOption
              id={`virtual-${option.id}`}
              value={option}
              ref={(element) => {
                element.getBoundingClientRect = () =>
                  new DOMRect(0, 0, 100, option.id === 0 ? 64 : 40);
              }}
            >
              {option.name}
            </ComboboxOption>
          )}
      </ComboboxOptions>
    </Combobox>
  ));
  await settle();
  await page.getByRole("button", { name: "Virtual" }).click();
  await settle(2);
  const rendered = document.querySelectorAll(
    '#virtual-options [role="option"]',
  );
  expect(rendered.length).toBeGreaterThan(3);
  expect(rendered.length).toBeLessThan(100);
  const first = document.getElementById("virtual-0")!;
  const second = document.getElementById("virtual-1")!;
  expect(first.getAttribute("aria-setsize")).toBe("100");
  expect(first.getAttribute("aria-posinset")).toBe("1");
  await expect.poll(() => second.style.transform).toBe("translateY(64px)");

  const input = page.getByRole("combobox");
  await userEvent.keyboard("{End}");
  await expect.poll(() => document.getElementById("virtual-99"), {
    timeout: 2_000,
  }).not.toBeNull();
  await expect.element(input).toHaveAttribute(
    "aria-activedescendant",
    "virtual-99",
  );
  expect((document.getElementById("virtual-options") as HTMLElement).scrollTop)
    .toBeGreaterThan(3_000);

  setPeople(initial.slice(90).map((person) => ({ ...person })));
  await settle(2);
  const last = document.getElementById("virtual-99")!;
  expect(last.getAttribute("aria-setsize")).toBe("10");
  expect(last.getAttribute("aria-posinset")).toBe("10");
  await expect.element(input).toHaveAttribute(
    "aria-activedescendant",
    "virtual-99",
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
