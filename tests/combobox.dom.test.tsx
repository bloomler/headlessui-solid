import { type JSX, render } from "@solidjs/web";
import { createSignal, DEV, type Element, flush, For, Show } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
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

interface SharedOption {
  disabled?: boolean;
  id: string;
  label: string;
}

type SharedMode = "dom" | "virtual";

const alice: Person = { id: 1, name: "Alice" };
const bob: Person = { id: 2, name: "Bob" };
const carol: Person = { disabled: true, id: 3, name: "Carol" };

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
  await Promise.resolve();
  flush();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  flush();
}

function mount(view: () => Element): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(view, host);
  flush();
  return host;
}

function key(
  target: HTMLElement,
  value: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: value,
    ...init,
  });
  target.dispatchEvent(event);
  flush();
  return event;
}

function input(target: HTMLInputElement, value: string): InputEvent {
  target.value = value;
  const event = new InputEvent("input", {
    bubbles: true,
    cancelable: true,
    data: value,
    inputType: "insertText",
  });
  target.dispatchEvent(event);
  flush();
  return event;
}

function SharedOptionList(props: {
  hold?: boolean;
  id: string;
  mode: SharedMode;
  options: readonly SharedOption[];
  static?: boolean;
  unmount?: boolean;
}): Element {
  return (
    <ComboboxOptions<SharedOption>
      hold={props.hold}
      id={`${props.id}-options`}
      modal={false}
      static={props.static}
      unmount={props.unmount}
    >
      {props.mode === "virtual"
        ? ({ option }) =>
          option && (
            <ComboboxOption
              disabled={option.disabled}
              id={`${props.id}-${option.id}`}
              value={option}
            >
              {option.label}
            </ComboboxOption>
          )
        : (
          <For each={props.options}>
            {(option) => (
              <ComboboxOption
                disabled={option.disabled}
                id={`${props.id}-${option.id}`}
                value={option}
              >
                {option.label}
              </ComboboxOption>
            )}
          </For>
        )}
    </ComboboxOptions>
  );
}

afterEach(async () => {
  vi.restoreAllMocks();
  dispose?.();
  dispose = undefined;
  await settle();
  host?.remove();
  host = undefined;
  document.getElementById("headlessui-portal-root")?.remove();
  document.body.replaceChildren();
});

test("render props, comparator identity, labels, static options, and DOM roles compose", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let rootElement: HTMLElement | undefined;

  const root = mount(() => (
    <Combobox<Person, false, "section">
      as="section"
      by="id"
      defaultValue={{ ...bob }}
      id="people-root"
      ref={(element) => rootElement = element}
    >
      {(slot) => (
        <>
          <output id="root-slot">
            {`${slot.open ? "open" : "closed"}:${slot.value.name}`}
          </output>
          <ComboboxInput<Person>
            id="people-input"
            type="search"
            displayValue={(person) => person?.name ?? ""}
          />
          <ComboboxButton id="people-button">
            {(slot) => slot.open ? "Close people" : "Open people"}
          </ComboboxButton>
          <ComboboxOptions id="people-options" static modal={false}>
            <div id="intermediate-one">
              <span id="intermediate-two">
                <ComboboxOption as="button" id="alice" value={alice}>
                  Alice
                </ComboboxOption>
                <ComboboxOption id="bob" value={bob}>
                  {(slot) => slot.selected ? "Bob selected" : "Bob"}
                </ComboboxOption>
                <ComboboxOption id="carol" value={carol} disabled>
                  Carol
                </ComboboxOption>
              </span>
            </div>
          </ComboboxOptions>
          <ComboboxLabel id="people-label">
            {(slot) => slot.open ? "Open person" : "Person"}
          </ComboboxLabel>
        </>
      )}
    </Combobox>
  ));
  await settle();

  const inputElement = root.querySelector<HTMLInputElement>("#people-input")!;
  const button = root.querySelector<HTMLButtonElement>("#people-button")!;
  const options = root.querySelector<HTMLElement>("#people-options")!;
  const label = root.querySelector<HTMLLabelElement>("#people-label")!;

  expect(rootElement?.tagName).toBe("SECTION");
  expect(rootElement?.id).toBe("people-root");
  expect(inputElement.type).toBe("search");
  expect(inputElement.value).toBe("Bob");
  expect(inputElement.getAttribute("aria-labelledby")).toBe("people-label");
  expect(button.type).toBe("button");
  expect(button.getAttribute("aria-labelledby")).toBe(
    "people-label people-button",
  );
  expect(label.htmlFor).toBe("people-input");
  expect(options.hidden).toBe(false);
  expect(options.getAttribute("role")).toBe("listbox");
  expect(root.querySelector("#bob")?.getAttribute("aria-selected")).toBe(
    "true",
  );
  expect(root.querySelector("#carol")?.getAttribute("aria-disabled")).toBe(
    "true",
  );
  expect(root.querySelector("#carol")?.hasAttribute("data-disabled")).toBe(
    true,
  );
  expect(root.querySelectorAll('[role="option"]')).toHaveLength(3);

  button.click();
  await settle();
  expect(root.querySelector("#root-slot")?.textContent).toBe("open:Bob");
  expect(button.textContent).toBe("Close people");
  expect(label.textContent).toBe("Open person");
  expect(inputElement.getAttribute("aria-activedescendant")).toBe("bob");
  expect(root.querySelector("#intermediate-one")?.getAttribute("role")).toBe(
    "none",
  );
  expect(root.querySelector("#intermediate-two")?.getAttribute("role")).toBe(
    "none",
  );
  expect(
    Array.from(root.querySelectorAll('[role="option"]')).map((option) =>
      option.id
    ),
  ).toEqual(["alice", "bob", "carol"]);

  button.click();
  await settle();
  expect(options.hidden).toBe(false);
  expect(root.querySelector("#root-slot")?.textContent).toBe("closed:Bob");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

function CustomButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  return <button {...props} />;
}

function CustomDiv(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} />;
}

test("input and button native type rules survive polymorphic Solid targets", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let componentButton: HTMLButtonElement | undefined;
  const root = mount(() => (
    <>
      <Combobox>
        <ComboboxInput id="default-input" />
        <ComboboxButton id="default-button">Default</ComboboxButton>
      </Combobox>
      <Combobox>
        <ComboboxInput id="search-input" type="search" />
        <ComboboxButton id="submit-button" type="submit">
          Submit
        </ComboboxButton>
      </Combobox>
      <Combobox>
        <ComboboxInput />
        <ComboboxButton
          as={CustomButton}
          id="component-button"
          ref={(element) => componentButton = element}
        >
          Component button
        </ComboboxButton>
      </Combobox>
      <Combobox>
        <ComboboxInput />
        <ComboboxButton as="div" id="div-button">Div</ComboboxButton>
      </Combobox>
      <Combobox>
        <ComboboxInput />
        <ComboboxButton as={CustomDiv} id="component-div">
          Component div
        </ComboboxButton>
      </Combobox>
    </>
  ));
  await settle();

  expect(root.querySelector<HTMLInputElement>("#default-input")?.type).toBe(
    "text",
  );
  expect(root.querySelector<HTMLInputElement>("#search-input")?.type).toBe(
    "search",
  );
  expect(root.querySelector("#default-button")?.getAttribute("type")).toBe(
    "button",
  );
  expect(root.querySelector("#submit-button")?.getAttribute("type")).toBe(
    "submit",
  );
  const renderedComponentButton = root.querySelector("#component-button");
  expect(componentButton?.tagName).toBe("BUTTON");
  expect(renderedComponentButton).toBe(componentButton);
  expect(renderedComponentButton?.getAttribute("type")).toBe(
    "button",
  );
  expect(root.querySelector("#div-button")?.hasAttribute("type")).toBe(false);
  expect(root.querySelector("#component-div")?.hasAttribute("type")).toBe(
    false,
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("button keyboard controls open, close, choose endpoints, and skip disabled roots", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let bubbled = 0;
  const root = mount(() => (
    <div onKeyDown={() => bubbled++}>
      <Combobox>
        <ComboboxInput id="button-key-input" />
        <ComboboxButton id="button-key-trigger">Trigger</ComboboxButton>
        <ComboboxOptions id="button-key-options" modal={false}>
          <ComboboxOption id="button-key-a" value="a">A</ComboboxOption>
          <ComboboxOption id="button-key-b" value="b" disabled>
            B
          </ComboboxOption>
          <ComboboxOption id="button-key-c" value="c">C</ComboboxOption>
        </ComboboxOptions>
      </Combobox>
      <Combobox disabled>
        <ComboboxInput id="disabled-key-input" />
        <ComboboxButton id="disabled-key-trigger">Disabled</ComboboxButton>
        <ComboboxOptions id="disabled-key-options" modal={false}>
          <ComboboxOption value="a">A</ComboboxOption>
        </ComboboxOptions>
      </Combobox>
    </div>
  ));
  await settle();

  const trigger = root.querySelector<HTMLElement>("#button-key-trigger")!;
  const inputElement = root.querySelector<HTMLInputElement>(
    "#button-key-input",
  )!;

  const enter = key(trigger, "Enter");
  await settle();
  expect(enter.defaultPrevented).toBe(true);
  expect(bubbled).toBe(0);
  expect(document.activeElement).toBe(inputElement);
  expect(inputElement.getAttribute("aria-activedescendant")).toBe(
    "button-key-a",
  );

  const escape = key(trigger, "Escape");
  await settle();
  expect(escape.defaultPrevented).toBe(true);
  expect(root.querySelector("#button-key-options")).toBeNull();
  expect(bubbled).toBe(0);

  key(trigger, "ArrowUp");
  await settle();
  expect(inputElement.getAttribute("aria-activedescendant")).toBe(
    "button-key-c",
  );
  key(trigger, "Escape");
  await settle();

  key(trigger, "ArrowDown");
  await settle();
  expect(inputElement.getAttribute("aria-activedescendant")).toBe(
    "button-key-a",
  );
  key(trigger, "Escape");
  await settle();

  const space = key(trigger, " ");
  await settle();
  expect(space.defaultPrevented).toBe(true);
  expect(root.querySelector("#button-key-options")).not.toBeNull();

  const disabledTrigger = root.querySelector<HTMLElement>(
    "#disabled-key-trigger",
  )!;
  const disabledEnter = key(disabledTrigger, "Enter");
  await settle();
  expect(disabledEnter.defaultPrevented).toBe(false);
  expect(root.querySelector("#disabled-key-options")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("input keyboard navigation covers disabled skipping, endpoints, selection, Tab, and Escape", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const changes: string[] = [];
  let bubbled = 0;
  const root = mount(() => (
    <div onKeyDown={() => bubbled++}>
      <Combobox onChange={(value) => value && changes.push(value)}>
        <ComboboxInput id="navigation-input" />
        <ComboboxButton>Trigger</ComboboxButton>
        <ComboboxOptions id="navigation-options" modal={false}>
          <ComboboxOption id="navigation-a" value="a">A</ComboboxOption>
          <ComboboxOption id="navigation-b" value="b" disabled>
            B
          </ComboboxOption>
          <ComboboxOption id="navigation-c" value="c">C</ComboboxOption>
        </ComboboxOptions>
      </Combobox>
    </div>
  ));
  await settle();
  const inputElement = root.querySelector<HTMLInputElement>(
    "#navigation-input",
  )!;
  const active = () => inputElement.getAttribute("aria-activedescendant");

  expect(key(inputElement, "ArrowDown").defaultPrevented).toBe(true);
  await settle();
  expect(active()).toBe("navigation-a");
  key(inputElement, "ArrowDown");
  expect(active()).toBe("navigation-c");
  key(inputElement, "ArrowUp");
  expect(active()).toBe("navigation-a");
  key(inputElement, "End");
  expect(active()).toBe("navigation-c");
  key(inputElement, "Home");
  expect(active()).toBe("navigation-a");
  key(inputElement, "PageDown");
  expect(active()).toBe("navigation-c");
  key(inputElement, "PageUp");
  expect(active()).toBe("navigation-a");

  const enter = key(inputElement, "Enter");
  await settle();
  expect(enter.defaultPrevented).toBe(true);
  expect(changes).toEqual(["a"]);
  expect(root.querySelector("#navigation-options")).toBeNull();

  key(inputElement, "ArrowDown");
  key(inputElement, "ArrowDown");
  const tab = key(inputElement, "Tab");
  await settle();
  expect(tab.defaultPrevented).toBe(false);
  expect(changes).toEqual(["a", "c"]);
  expect(root.querySelector("#navigation-options")).toBeNull();

  input(inputElement, "query");
  await settle();
  expect(root.querySelector("#navigation-options")).not.toBeNull();
  const bubblesBeforeEscape = bubbled;
  const escape = key(inputElement, "Escape");
  await settle();
  expect(escape.defaultPrevented).toBe(true);
  expect(bubbled).toBe(bubblesBeforeEscape);
  expect(inputElement.value).toBe("c");
  expect(root.querySelector("#navigation-options")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("reactive registration preserves DOM order and explicit order after remounts", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setMiddle!: (value: boolean) => boolean;
  const root = mount(() => {
    const [middle, updateMiddle] = createSignal(true);
    setMiddle = updateMiddle;
    return (
      <>
        <Combobox>
          <ComboboxInput id="dom-order-input" />
          <ComboboxButton id="dom-order-trigger">DOM order</ComboboxButton>
          <ComboboxOptions modal={false}>
            <ComboboxOption id="dom-a" value="a">A</ComboboxOption>
            <Show when={middle()}>
              <ComboboxOption id="dom-b" value="b">B</ComboboxOption>
            </Show>
            <ComboboxOption id="dom-c" value="c">C</ComboboxOption>
          </ComboboxOptions>
        </Combobox>
        <Combobox>
          <ComboboxInput id="explicit-order-input" />
          <ComboboxButton id="explicit-order-trigger">
            Explicit order
          </ComboboxButton>
          <ComboboxOptions modal={false}>
            <ComboboxOption id="ordered-c" value="c" order={3}>
              C
            </ComboboxOption>
            <ComboboxOption id="ordered-a" value="a" order={1}>
              A
            </ComboboxOption>
            <ComboboxOption id="ordered-b" value="b" order={2}>
              B
            </ComboboxOption>
          </ComboboxOptions>
        </Combobox>
      </>
    );
  });
  await settle();

  setMiddle(false);
  setMiddle(true);
  await settle();
  key(root.querySelector<HTMLButtonElement>("#dom-order-trigger")!, "Enter");
  await settle();
  const domInput = root.querySelector<HTMLInputElement>("#dom-order-input")!;
  expect(domInput.getAttribute("aria-activedescendant")).toBe("dom-a");
  key(domInput, "ArrowDown");
  expect(domInput.getAttribute("aria-activedescendant")).toBe("dom-b");
  key(domInput, "ArrowDown");
  expect(domInput.getAttribute("aria-activedescendant")).toBe("dom-c");

  root.querySelector<HTMLButtonElement>("#explicit-order-trigger")!.click();
  await settle();
  const orderedInput = root.querySelector<HTMLInputElement>(
    "#explicit-order-input",
  )!;
  expect(orderedInput.getAttribute("aria-activedescendant")).toBe("ordered-a");
  key(orderedInput, "ArrowDown");
  expect(orderedInput.getAttribute("aria-activedescendant")).toBe("ordered-b");
  key(orderedInput, "ArrowDown");
  expect(orderedInput.getAttribute("aria-activedescendant")).toBe("ordered-c");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("multiple option presses toggle values, remain open, serialize, and reset", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const changes: Person[][] = [];
  const root = mount(() => (
    <form id="multiple-form">
      <Combobox<Person, true>
        multiple
        by="id"
        defaultValue={[{ ...alice }]}
        name="people"
        onChange={(value) => changes.push(value)}
      >
        {(slot) => (
          <>
            <output id="multiple-output">
              {slot.value.map((person) => person.name).join(",")}
            </output>
            <ComboboxInput<Person[]>
              displayValue={(value) =>
                value.map((person) => person.name).join(",")}
            />
            <ComboboxButton id="multiple-trigger">Multiple</ComboboxButton>
            <ComboboxOptions id="multiple-options" modal={false}>
              <ComboboxOption id="multiple-alice" value={alice}>
                Alice
              </ComboboxOption>
              <ComboboxOption id="multiple-bob" value={bob}>Bob</ComboboxOption>
              <ComboboxOption id="multiple-carol" value={carol} disabled>
                Carol
              </ComboboxOption>
            </ComboboxOptions>
          </>
        )}
      </Combobox>
    </form>
  ));
  await settle();
  root.querySelector<HTMLButtonElement>("#multiple-trigger")!.click();
  await settle();
  const optionsElement = root.querySelector("#multiple-options");

  root.querySelector("#multiple-bob")!.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true }),
  );
  await settle();
  expect(root.querySelector("#multiple-options")).not.toBeNull();
  expect(root.querySelector("#multiple-options")).toBe(optionsElement);
  expect(root.querySelector("#multiple-output")?.textContent).toBe(
    "Alice,Bob",
  );
  expect(root.querySelector("#multiple-alice")?.getAttribute("aria-selected"))
    .toBe("true");
  expect(root.querySelector("#multiple-bob")?.getAttribute("aria-selected"))
    .toBe("true");
  expect(changes.at(-1)?.map((person) => person.id)).toEqual([1, 2]);

  root.querySelector("#multiple-alice")!.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true }),
  );
  await settle();
  expect(changes.at(-1)?.map((person) => person.id)).toEqual([2]);
  const form = root.querySelector<HTMLFormElement>("#multiple-form")!;
  expect([...new FormData(form).entries()]).toEqual([
    ["people[0][id]", "2"],
    ["people[0][name]", "Bob"],
  ]);

  form.reset();
  await settle();
  expect([...new FormData(form).entries()]).toEqual([
    ["people[0][id]", "1"],
    ["people[0][name]", "Alice"],
  ]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Solid reactive ownership avoids controlled-mode warnings", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  let setValue!: (value: string | undefined) => string | undefined;
  const root = mount(() => {
    const [value, updateValue] = createSignal<string | undefined>();
    setValue = updateValue;
    return (
      <Combobox value={value()} onChange={() => {}}>
        <ComboboxInput id="ownership-input" />
        <ComboboxButton>Trigger</ComboboxButton>
        <ComboboxOptions static modal={false}>
          <ComboboxOption value="bob">Bob</ComboboxOption>
        </ComboboxOptions>
      </Combobox>
    );
  });
  await settle();
  const inputElement = root.querySelector<HTMLInputElement>(
    "#ownership-input",
  )!;

  expect(inputElement.value).toBe("");
  setValue("bob");
  await settle();
  expect(inputElement.value).toBe("bob");
  setValue(undefined);
  await settle();
  expect(inputElement.value).toBe("");
  expect(warning).not.toHaveBeenCalled();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test.each(["dom", "virtual"] as const)(
  "%s mode: button keys cover selected, hidden, empty, all-disabled, and disabled-root states",
  async (mode) => {
    const diagnostics = DEV?.diagnostics.capture();
    const choices: readonly SharedOption[] = [
      { id: "a", label: "Option A" },
      { id: "b", label: "Option B" },
      { id: "c", label: "Option C" },
    ];
    const unavailable: readonly SharedOption[] = choices.map((option) => ({
      ...option,
      disabled: true,
    }));
    const virtual = (options: readonly SharedOption[]) =>
      mode === "virtual"
        ? {
          disabled: (option: SharedOption) => Boolean(option.disabled),
          options,
        }
        : null;
    let bubbled = 0;

    const root = mount(() => (
      <div onKeyDown={() => bubbled++}>
        <Combobox<SharedOption>
          by="id"
          defaultValue={{ ...choices[1] }}
          virtual={virtual(choices)}
        >
          <ComboboxInput<SharedOption>
            id={`${mode}-selected-input`}
            displayValue={(option) => option?.label ?? ""}
          />
          <ComboboxButton id={`${mode}-selected-trigger`}>
            Selected
          </ComboboxButton>
          <SharedOptionList
            id={`${mode}-selected`}
            mode={mode}
            options={choices}
            unmount={false}
          />
        </Combobox>
        <Combobox<SharedOption> virtual={virtual(choices)}>
          <ComboboxInput id={`${mode}-endpoint-input`} />
          <ComboboxButton id={`${mode}-endpoint-trigger`}>
            Endpoint
          </ComboboxButton>
          <SharedOptionList
            id={`${mode}-endpoint`}
            mode={mode}
            options={choices}
          />
        </Combobox>
        <Combobox<SharedOption> virtual={virtual([])}>
          <ComboboxInput id={`${mode}-empty-input`} />
          <ComboboxButton id={`${mode}-empty-trigger`}>Empty</ComboboxButton>
          <SharedOptionList
            id={`${mode}-empty`}
            mode={mode}
            options={[]}
          />
        </Combobox>
        <Combobox<SharedOption> virtual={virtual(unavailable)}>
          <ComboboxInput id={`${mode}-unavailable-input`} />
          <ComboboxButton id={`${mode}-unavailable-trigger`}>
            Unavailable
          </ComboboxButton>
          <SharedOptionList
            id={`${mode}-unavailable`}
            mode={mode}
            options={unavailable}
          />
        </Combobox>
        <Combobox<SharedOption> disabled virtual={virtual(choices)}>
          <ComboboxInput id={`${mode}-disabled-input`} />
          <ComboboxButton id={`${mode}-disabled-trigger`}>
            Disabled root
          </ComboboxButton>
          <SharedOptionList
            id={`${mode}-disabled`}
            mode={mode}
            options={choices}
          />
        </Combobox>
      </div>
    ));
    await settle();

    const selectedTrigger = root.querySelector<HTMLElement>(
      `#${mode}-selected-trigger`,
    )!;
    const selectedInput = root.querySelector<HTMLInputElement>(
      `#${mode}-selected-input`,
    )!;
    expect(root.querySelector<HTMLElement>(`#${mode}-selected-options`)?.hidden)
      .toBe(true);
    key(selectedTrigger, "Enter");
    await settle();
    expect(selectedInput.getAttribute("aria-activedescendant")).toBe(
      `${mode}-selected-b`,
    );
    expect(root.querySelector<HTMLElement>(`#${mode}-selected-options`)?.hidden)
      .toBe(false);
    const openEscape = key(selectedTrigger, "Escape");
    await settle();
    expect(openEscape.defaultPrevented).toBe(true);
    expect(bubbled).toBe(0);
    key(selectedTrigger, "Escape");
    expect(bubbled).toBe(1);

    const endpointTrigger = root.querySelector<HTMLElement>(
      `#${mode}-endpoint-trigger`,
    )!;
    key(endpointTrigger, "ArrowUp");
    await settle();
    expect(
      root.querySelector<HTMLInputElement>(`#${mode}-endpoint-input`)
        ?.getAttribute("aria-activedescendant"),
    ).toBe(`${mode}-endpoint-c`);
    key(endpointTrigger, "Escape");

    key(root.querySelector<HTMLElement>(`#${mode}-empty-trigger`)!, " ");
    await settle();
    expect(
      root.querySelector<HTMLInputElement>(`#${mode}-empty-input`)
        ?.hasAttribute("aria-activedescendant"),
    ).toBe(false);

    key(
      root.querySelector<HTMLElement>(`#${mode}-unavailable-trigger`)!,
      " ",
    );
    await settle();
    expect(
      root.querySelector<HTMLInputElement>(`#${mode}-unavailable-input`)
        ?.hasAttribute("aria-activedescendant"),
    ).toBe(false);

    const disabledEnter = key(
      root.querySelector<HTMLElement>(`#${mode}-disabled-trigger`)!,
      "Enter",
    );
    await settle();
    expect(disabledEnter.defaultPrevented).toBe(false);
    expect(root.querySelector(`#${mode}-disabled-options`)).toBeNull();
    expect(diagnostics?.stop() ?? []).toEqual([]);
  },
);

test.each(["dom", "virtual"] as const)(
  "%s mode: input keys cover endpoints, disabled sets, selection, Shift+Tab, Escape bubbling, and clearing",
  async (mode) => {
    const diagnostics = DEV?.diagnostics.capture();
    const choices: readonly SharedOption[] = [
      { disabled: true, id: "a", label: "Option A" },
      { id: "b", label: "Option B" },
      { disabled: true, id: "c", label: "Option C" },
      { id: "d", label: "Option D" },
    ];
    const unavailable = choices.map((option) => ({
      ...option,
      disabled: true,
    }));
    const single = choices.map((option, index) => ({
      ...option,
      disabled: index !== 1,
    }));
    const virtual = (options: readonly SharedOption[]) =>
      mode === "virtual"
        ? {
          disabled: (option: SharedOption) => Boolean(option.disabled),
          options,
        }
        : null;
    const changes: string[] = [];
    const cleared: Array<SharedOption | null> = [];
    let bubbled = 0;

    const root = mount(() => (
      <div onKeyDown={() => bubbled++}>
        <Combobox<SharedOption>
          by="id"
          onChange={(option) => option && changes.push(option.id)}
          virtual={virtual(choices)}
        >
          <ComboboxInput id={`${mode}-matrix-input`} />
          <ComboboxButton>Matrix</ComboboxButton>
          <SharedOptionList
            id={`${mode}-matrix`}
            mode={mode}
            options={choices}
          />
        </Combobox>
        <Combobox<SharedOption> virtual={virtual(unavailable)}>
          <ComboboxInput id={`${mode}-all-disabled-input`} />
          <ComboboxButton>All disabled</ComboboxButton>
          <SharedOptionList
            id={`${mode}-all-disabled`}
            mode={mode}
            options={unavailable}
          />
        </Combobox>
        <Combobox<SharedOption> virtual={virtual(single)}>
          <ComboboxInput id={`${mode}-single-input`} />
          <ComboboxButton>Single enabled</ComboboxButton>
          <SharedOptionList
            id={`${mode}-single`}
            mode={mode}
            options={single}
          />
        </Combobox>
        <Combobox<SharedOption> virtual={virtual(choices)}>
          <ComboboxInput id={`${mode}-static-input`} />
          <ComboboxButton>Static escape</ComboboxButton>
          <SharedOptionList
            id={`${mode}-static`}
            mode={mode}
            options={choices}
            static
          />
        </Combobox>
        <Combobox<SharedOption> virtual={virtual([])}>
          <ComboboxInput id={`${mode}-no-panel-input`} />
          <ComboboxButton>No panel</ComboboxButton>
        </Combobox>
        <Combobox<SharedOption>
          by="id"
          defaultValue={choices[1]}
          onChange={(option) => cleared.push(option)}
          virtual={virtual(choices)}
        >
          <ComboboxInput<SharedOption>
            id={`${mode}-clear-input`}
            displayValue={(option) => option?.label ?? ""}
          />
          <ComboboxButton>Clear</ComboboxButton>
          <SharedOptionList
            id={`${mode}-clear`}
            mode={mode}
            options={choices}
          />
        </Combobox>
      </div>
    ));
    await settle();
    const matrix = root.querySelector<HTMLInputElement>(
      `#${mode}-matrix-input`,
    )!;
    const active = () => matrix.getAttribute("aria-activedescendant");

    key(matrix, "ArrowDown");
    await settle();
    expect(active()).toBe(`${mode}-matrix-b`);
    key(matrix, "ArrowDown");
    expect(active()).toBe(`${mode}-matrix-d`);
    key(matrix, "Home");
    expect(active()).toBe(`${mode}-matrix-b`);
    key(matrix, "End");
    expect(active()).toBe(`${mode}-matrix-d`);
    key(matrix, "PageUp");
    expect(active()).toBe(`${mode}-matrix-b`);
    key(matrix, "PageDown");
    expect(active()).toBe(`${mode}-matrix-d`);
    key(matrix, "Enter");
    await settle();
    expect(changes).toEqual(["d"]);

    key(matrix, "ArrowDown");
    key(matrix, "Home");
    const shiftTab = key(matrix, "Tab", { shiftKey: true });
    await settle();
    expect(shiftTab.defaultPrevented).toBe(false);
    expect(changes).toEqual(["d", "b"]);

    const allDisabled = root.querySelector<HTMLInputElement>(
      `#${mode}-all-disabled-input`,
    )!;
    key(allDisabled, "ArrowDown");
    await settle();
    for (const command of ["End", "PageDown", "Home", "PageUp"]) {
      key(allDisabled, command);
      expect(allDisabled.hasAttribute("aria-activedescendant")).toBe(false);
    }

    const singleInput = root.querySelector<HTMLInputElement>(
      `#${mode}-single-input`,
    )!;
    key(singleInput, "ArrowDown");
    await settle();
    for (const command of ["ArrowDown", "ArrowUp", "End", "Home"]) {
      key(singleInput, command);
      expect(singleInput.getAttribute("aria-activedescendant")).toBe(
        `${mode}-single-b`,
      );
    }

    const staticInput = root.querySelector<HTMLInputElement>(
      `#${mode}-static-input`,
    )!;
    key(staticInput, "ArrowDown");
    await settle();
    const beforeStaticEscape = bubbled;
    key(staticInput, "Escape");
    expect(bubbled).toBe(beforeStaticEscape + 1);

    const noPanel = root.querySelector<HTMLInputElement>(
      `#${mode}-no-panel-input`,
    )!;
    key(noPanel, "ArrowDown");
    await settle();
    const beforeNoPanelEscape = bubbled;
    key(noPanel, "Escape");
    expect(bubbled).toBe(beforeNoPanelEscape + 1);

    const clearInput = root.querySelector<HTMLInputElement>(
      `#${mode}-clear-input`,
    )!;
    expect(clearInput.value).toBe("Option B");
    input(clearInput, "");
    await settle();
    expect(cleared).toEqual([null]);
    expect(clearInput.hasAttribute("aria-activedescendant")).toBe(false);
    expect(diagnostics?.stop() ?? []).toEqual([]);
  },
);

test.each(["dom", "virtual"] as const)(
  "%s mode: filtering keeps active identity and excludes disabled full, partial, and spaced matches",
  async (mode) => {
    const diagnostics = DEV?.diagnostics.capture();
    const people: readonly SharedOption[] = [
      { id: "a", label: "alice jones" },
      { disabled: true, id: "b", label: "bob the builder" },
      { id: "c", label: "charlie bit me" },
    ];
    const identityPeople: readonly SharedOption[] = [
      { id: "a", label: "person a" },
      { id: "b", label: "person b" },
      { id: "c", label: "person c" },
    ];

    const root = mount(() => {
      const [query, setQuery] = createSignal("");
      const [identityQuery, setIdentityQuery] = createSignal("");
      const filtered = () =>
        people.filter((option) =>
          option.label.toLowerCase().includes(query().toLowerCase())
        );
      const identityFiltered = () =>
        identityPeople.filter((option) =>
          option.label.toLowerCase().includes(identityQuery().toLowerCase())
        );
      return (
        <>
          <Combobox<SharedOption>
            by="id"
            virtual={mode === "virtual"
              ? {
                disabled: (option) => Boolean(option.disabled),
                options: filtered(),
              }
              : null}
          >
            <ComboboxInput
              id={`${mode}-filter-input`}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <ComboboxButton>Filter</ComboboxButton>
            <SharedOptionList
              id={`${mode}-filter`}
              mode={mode}
              options={filtered()}
            />
          </Combobox>
          <Combobox<SharedOption>
            by="id"
            virtual={mode === "virtual"
              ? { options: identityFiltered() }
              : null}
          >
            <ComboboxInput
              id={`${mode}-identity-input`}
              onChange={(event) => setIdentityQuery(event.currentTarget.value)}
            />
            <ComboboxButton>Identity filter</ComboboxButton>
            <SharedOptionList
              id={`${mode}-identity`}
              mode={mode}
              options={identityFiltered()}
            />
          </Combobox>
        </>
      );
    });
    await settle();

    const filterInput = root.querySelector<HTMLInputElement>(
      `#${mode}-filter-input`,
    )!;
    input(filterInput, "ali");
    await settle();
    key(filterInput, "Home");
    expect(filterInput.getAttribute("aria-activedescendant")).toBe(
      `${mode}-filter-a`,
    );
    expect(root.querySelectorAll(`#${mode}-filter-options [role="option"]`))
      .toHaveLength(1);

    input(filterInput, "bob t");
    await settle();
    key(filterInput, "Home");
    expect(filterInput.hasAttribute("aria-activedescendant")).toBe(false);
    expect(
      root.querySelector(`#${mode}-filter-b`)?.getAttribute("aria-disabled"),
    )
      .toBe("true");

    input(filterInput, "charlie bit");
    await settle();
    key(filterInput, "Home");
    expect(filterInput.getAttribute("aria-activedescendant")).toBe(
      `${mode}-filter-c`,
    );

    input(filterInput, "no matching option");
    await settle();
    expect(
      root.querySelector<HTMLElement>(`#${mode}-filter-options`)
        ?.childElementCount,
    ).toBe(0);

    const identityInput = root.querySelector<HTMLInputElement>(
      `#${mode}-identity-input`,
    )!;
    key(identityInput, "ArrowDown");
    await settle();
    key(identityInput, "ArrowDown");
    expect(identityInput.getAttribute("aria-activedescendant")).toBe(
      `${mode}-identity-b`,
    );
    input(identityInput, "person b");
    await settle();
    expect(identityInput.getAttribute("aria-activedescendant")).toBe(
      `${mode}-identity-b`,
    );
    input(identityInput, "person");
    await settle();
    expect(identityInput.getAttribute("aria-activedescendant")).toBe(
      `${mode}-identity-b`,
    );
    expect(diagnostics?.stop() ?? []).toEqual([]);
  },
);

test.each(["dom", "virtual"] as const)(
  "%s mode: label, immediate focus, pointer activation, disabled options, focus, leave, hold, and selection compose",
  async (mode) => {
    const diagnostics = DEV?.diagnostics.capture();
    const choices: readonly SharedOption[] = [
      { id: "a", label: "Option A" },
      { id: "b", label: "Option B" },
      { disabled: true, id: "c", label: "Option C" },
    ];
    const virtual = mode === "virtual"
      ? {
        disabled: (option: SharedOption) => Boolean(option.disabled),
        options: choices,
      }
      : null;
    const changes: string[] = [];
    const root = mount(() => (
      <>
        <Combobox<SharedOption>
          immediate
          onChange={(option) => option && changes.push(option.id)}
          virtual={virtual}
        >
          <ComboboxLabel id={`${mode}-pointer-label`}>Choose</ComboboxLabel>
          <ComboboxInput id={`${mode}-pointer-input`} />
          <ComboboxButton id={`${mode}-pointer-trigger`}>
            Pointer
          </ComboboxButton>
          <SharedOptionList
            id={`${mode}-pointer`}
            mode={mode}
            options={choices}
          />
        </Combobox>
        <Combobox<SharedOption> immediate disabled virtual={virtual}>
          <ComboboxInput id={`${mode}-immediate-disabled-input`} />
          <SharedOptionList
            id={`${mode}-immediate-disabled`}
            mode={mode}
            options={choices}
          />
        </Combobox>
        <Combobox<SharedOption> virtual={virtual}>
          <ComboboxInput id={`${mode}-non-immediate-input`} />
          <SharedOptionList
            id={`${mode}-non-immediate`}
            mode={mode}
            options={choices}
          />
        </Combobox>
        <Combobox<SharedOption> virtual={virtual}>
          <ComboboxInput id={`${mode}-hold-input`} />
          <ComboboxButton id={`${mode}-hold-trigger`}>Hold</ComboboxButton>
          <SharedOptionList
            hold
            id={`${mode}-hold`}
            mode={mode}
            options={choices}
          />
        </Combobox>
      </>
    ));
    await settle();

    const pointerInput = root.querySelector<HTMLInputElement>(
      `#${mode}-pointer-input`,
    )!;
    root.querySelector<HTMLElement>(`#${mode}-pointer-label`)!.click();
    await settle();
    expect(document.activeElement).toBe(pointerInput);
    expect(root.querySelector(`#${mode}-pointer-options`)).not.toBeNull();
    if (mode === "virtual") {
      const virtualContent = root.querySelector<HTMLElement>(
        "#virtual-pointer-options > [role=none]",
      );
      expect(virtualContent?.style.height).toBe("120px");
    }

    root.querySelector<HTMLElement>(`#${mode}-pointer-trigger`)!.click();
    await settle();
    expect(root.querySelector(`#${mode}-pointer-options`)).toBeNull();
    root.querySelector<HTMLElement>(`#${mode}-pointer-trigger`)!.click();
    await settle();

    const optionB = root.querySelector<HTMLElement>(`#${mode}-pointer-b`)!;
    const optionC = root.querySelector<HTMLElement>(`#${mode}-pointer-c`)!;
    optionB.dispatchEvent(
      new MouseEvent("mouseenter", { bubbles: true, clientX: 1, clientY: 1 }),
    );
    optionB.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 2, clientY: 2 }),
    );
    await settle();
    expect(pointerInput.getAttribute("aria-activedescendant")).toBe(
      `${mode}-pointer-b`,
    );
    optionC.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 3, clientY: 3 }),
    );
    await settle();
    expect(pointerInput.getAttribute("aria-activedescendant")).toBe(
      `${mode}-pointer-b`,
    );
    optionB.dispatchEvent(
      new MouseEvent("mouseleave", { bubbles: true, clientX: 4, clientY: 4 }),
    );
    await settle();
    expect(pointerInput.hasAttribute("aria-activedescendant")).toBe(false);
    optionC.dispatchEvent(new FocusEvent("focus"));
    await settle();
    expect(pointerInput.hasAttribute("aria-activedescendant")).toBe(false);
    optionB.dispatchEvent(new FocusEvent("focus"));
    await settle();
    expect(pointerInput.getAttribute("aria-activedescendant")).toBe(
      `${mode}-pointer-b`,
    );
    optionC.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    expect(changes).toEqual([]);
    optionB.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    await settle();
    expect(changes).toEqual(["b"]);
    expect(root.querySelector(`#${mode}-pointer-options`)).toBeNull();

    const immediateDisabled = root.querySelector<HTMLInputElement>(
      `#${mode}-immediate-disabled-input`,
    )!;
    immediateDisabled.focus();
    await settle();
    expect(root.querySelector(`#${mode}-immediate-disabled-options`))
      .toBeNull();
    const nonImmediate = root.querySelector<HTMLInputElement>(
      `#${mode}-non-immediate-input`,
    )!;
    nonImmediate.focus();
    await settle();
    expect(root.querySelector(`#${mode}-non-immediate-options`)).toBeNull();

    root.querySelector<HTMLButtonElement>(`#${mode}-hold-trigger`)!.click();
    await settle();
    const holdInput = root.querySelector<HTMLInputElement>(
      `#${mode}-hold-input`,
    )!;
    const holdB = root.querySelector<HTMLElement>(`#${mode}-hold-b`)!;
    holdB.dispatchEvent(
      new MouseEvent("mouseenter", { bubbles: true, clientX: 1, clientY: 1 }),
    );
    holdB.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 2, clientY: 2 }),
    );
    await settle();
    holdB.dispatchEvent(
      new MouseEvent("mouseleave", { bubbles: true, clientX: 3, clientY: 3 }),
    );
    await settle();
    expect(holdInput.getAttribute("aria-activedescendant")).toBe(
      `${mode}-hold-b`,
    );
    expect(diagnostics?.stop() ?? []).toEqual([]);
  },
);

test("value/display synchronization does not overwrite an in-progress query", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let query = () => "";
  const root = mount(() => {
    const [value, setValue] = createSignal<string | null>("bob");
    const [currentQuery, setQuery] = createSignal("");
    query = currentQuery;

    return (
      <Combobox
        value={value() ?? undefined}
        onChange={(next) => setValue(next)}
      >
        {(slot) => (
          <>
            <ComboboxInput
              id="display-sync-input"
              onChange={(event) => setQuery(event.currentTarget.value)}
              displayValue={(person) =>
                `${person ?? ""} - ${slot.open ? "open" : "closed"}`}
            />
            <ComboboxButton id="display-sync-trigger">Trigger</ComboboxButton>
            <ComboboxOptions id="display-sync-options" modal={false}>
              <ComboboxOption id="display-sync-alice" value="alice">
                alice
              </ComboboxOption>
              <ComboboxOption id="display-sync-bob" value="bob">
                bob
              </ComboboxOption>
              <ComboboxOption id="display-sync-charlie" value="charlie">
                charlie
              </ComboboxOption>
            </ComboboxOptions>
          </>
        )}
      </Combobox>
    );
  });
  await settle();

  const inputElement = root.querySelector<HTMLInputElement>(
    "#display-sync-input",
  )!;
  const trigger = root.querySelector<HTMLButtonElement>(
    "#display-sync-trigger",
  )!;

  expect(inputElement.value).toBe("bob - closed");
  trigger.click();
  await settle();
  expect(inputElement.value).toBe("bob - open");
  trigger.click();
  await settle();
  expect(inputElement.value).toBe("bob - closed");

  inputElement.focus();
  for (let index = 0; index < " - closed".length; index++) {
    key(inputElement, "Backspace");
    input(inputElement, inputElement.value.slice(0, -1));
  }
  inputElement.select();
  let typed = "";
  for (const character of "alice") {
    key(inputElement, character);
    typed += character;
    input(inputElement, typed);
  }
  await settle();
  expect(query()).toBe("alice");
  expect(inputElement.value).toBe("alice");
  expect(root.querySelector("#display-sync-options")).not.toBeNull();

  root.querySelector<HTMLElement>("#display-sync-charlie")!.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
    }),
  );
  await settle();
  expect(inputElement.value).toBe("charlie - closed");
  expect(root.querySelector("#display-sync-options")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
