import { type JSX, render } from "@solidjs/web";
import { createSignal, DEV, flush } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Checkbox } from "../src/components/checkbox/checkbox.tsx";
import {
  Switch,
  SwitchDescription,
  SwitchGroup,
  SwitchLabel,
} from "../src/components/switch/switch.tsx";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  host?.remove();
  dispose = undefined;
  host = undefined;
});

function mount(
  children: () => Parameters<typeof render>[0] extends () => infer T ? T
    : never,
) {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(children, host);
  flush();
}

function CustomButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  return <button {...props} />;
}

function CustomDiv(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} />;
}

test("Checkbox toggles synchronously, submits, and resets its hidden field", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  function Example() {
    const [formValue, setFormValue] = createSignal("initial");
    const [submits, setSubmits] = createSignal(0);
    let form: HTMLFormElement | undefined;

    return (
      <form
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          setSubmits((value) => value + 1);
        }}
      >
        <Checkbox
          id="browser-checkbox"
          defaultChecked
          name="terms"
          value="accepted"
          onChange={() => {
            setFormValue(String(new FormData(form).get("terms")));
          }}
        >
          {(slot) => slot.checked ? "Accepted" : "Declined"}
        </Checkbox>
        <button type="reset">Reset checkbox</button>
        <output aria-label="checkbox form value">{formValue()}</output>
        <output aria-label="checkbox submits">{submits()}</output>
      </form>
    );
  }

  mount(() => <Example />);

  const checked = page.getByRole("checkbox", { name: "Accepted" });
  await expect.element(checked).toHaveAttribute("aria-checked", "true");
  await checked.click();
  flush();
  const unchecked = page.getByRole("checkbox", { name: "Declined" });
  await expect.element(unchecked).toHaveAttribute("aria-checked", "false");
  await expect.element(page.getByLabelText("checkbox form value"))
    .toHaveTextContent("null");

  unchecked.element().focus();
  await userEvent.keyboard(" ");
  flush();
  await expect.element(page.getByRole("checkbox", { name: "Accepted" }))
    .toHaveAttribute("data-checked", "");
  await expect.element(page.getByLabelText("checkbox form value"))
    .toHaveTextContent("accepted");

  page.getByRole("checkbox", { name: "Accepted" }).element().focus();
  await userEvent.keyboard(" ");
  await page.getByRole("button", { name: "Reset checkbox" }).click();
  flush();
  await expect.element(page.getByRole("checkbox", { name: "Accepted" }))
    .toHaveAttribute("aria-checked", "true");
  await expect.element(page.getByLabelText("checkbox form value"))
    .toHaveTextContent("accepted");

  page.getByRole("checkbox", { name: "Accepted" }).element().focus();
  await userEvent.keyboard("{Enter}");
  flush();
  await expect.element(page.getByLabelText("checkbox submits"))
    .toHaveTextContent("1");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Switch compound labels toggle/focus once and passive labels stay inert", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  function Example() {
    const [checked, setChecked] = createSignal(false);
    const [changes, setChanges] = createSignal(0);

    return (
      <>
        <SwitchGroup>
          <Switch
            id="browser-switch"
            checked={checked()}
            onChange={(nextChecked) => {
              setChecked(nextChecked);
              setChanges((value) => value + 1);
            }}
          >
            {(slot) => slot.checked ? "Enabled" : "Disabled"}
          </Switch>
          <SwitchLabel>Notifications</SwitchLabel>
          <SwitchDescription>Product updates</SwitchDescription>
        </SwitchGroup>
        <output aria-label="switch changes">{changes()}</output>
        <SwitchGroup>
          <Switch id="passive-switch">Passive target</Switch>
          <SwitchLabel passive>Passive label</SwitchLabel>
        </SwitchGroup>
        <SwitchGroup>
          <Switch id="custom-label-switch">Custom target</Switch>
          <SwitchLabel as="span">Custom label</SwitchLabel>
        </SwitchGroup>
      </>
    );
  }

  mount(() => <Example />);

  const label = page.getByText("Notifications", { exact: true });
  await label.click();
  flush();
  const enabled = page.getByRole("switch", { name: "Notifications" });
  await expect.element(enabled).toHaveAttribute("aria-checked", "true");
  await expect.element(page.getByLabelText("switch changes")).toHaveTextContent(
    "1",
  );
  expect(document.activeElement?.id).toBe("browser-switch");
  await expect.element(enabled).toHaveAttribute(
    "aria-describedby",
    expect.stringContaining("headlessui-description-"),
  );

  await page.getByText("Passive label", { exact: true }).click();
  flush();
  await expect.element(page.getByRole("switch", { name: "Passive label" }))
    .toHaveAttribute("aria-checked", "false");

  await page.getByText("Custom label", { exact: true }).click();
  flush();
  await expect.element(page.getByRole("switch", { name: "Custom label" }))
    .toHaveAttribute("aria-checked", "true");
  expect(document.activeElement?.id).toBe("custom-label-switch");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Switch.Group follows a switch whose as prop replaces its element", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  function Example() {
    const [tag, setTag] = createSignal<"button" | "span">("button");

    return (
      <>
        <button type="button" onClick={() => setTag("span")}>
          Replace switch
        </button>
        <SwitchGroup>
          <SwitchLabel as="span">Dynamic label</SwitchLabel>
          <Switch
            as={tag()}
            id={tag() === "button" ? "initial-switch" : "replacement-switch"}
          >
            Dynamic switch
          </Switch>
        </SwitchGroup>
      </>
    );
  }

  mount(() => <Example />);

  const initial = page.getByRole("switch", { name: "Dynamic label" }).element();
  expect(initial.tagName).toBe("BUTTON");
  expect(initial.id).toBe("initial-switch");

  await page.getByRole("button", { name: "Replace switch" }).click();
  flush();

  const replacement = page.getByRole("switch", { name: "Dynamic label" })
    .element();
  expect(replacement).not.toBe(initial);
  expect(replacement.tagName).toBe("SPAN");
  expect(replacement.id).toBe("replacement-switch");
  expect(initial.isConnected).toBe(false);

  await page.getByText("Dynamic label", { exact: true }).click();
  flush();
  await expect.element(
    page.getByRole("switch", { name: "Dynamic label" }),
  ).toHaveAttribute("aria-checked", "true");
  expect(document.activeElement).toBe(replacement);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Switch preserves controlled authority and keyboard/form semantics", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  function Example() {
    const [requested, setRequested] = createSignal("none");
    const [submits, setSubmits] = createSignal(0);

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmits((value) => value + 1);
        }}
      >
        <Switch
          id="controlled-switch"
          checked={false}
          name="notifications"
          tabindex={-1}
          onChange={(nextChecked) => setRequested(String(nextChecked))}
        >
          Controlled
        </Switch>
        <Switch id="custom-switch" as="span">Custom switch</Switch>
        <Switch id="component-switch" as={CustomButton}>
          Component switch
        </Switch>
        <output aria-label="requested switch state">{requested()}</output>
        <output aria-label="switch submits">{submits()}</output>
      </form>
    );
  }

  mount(() => <Example />);

  const controlled = page.getByRole("switch", { name: "Controlled" });
  await expect.element(controlled).toHaveAttribute("tabindex", "0");
  controlled.element().focus();
  await userEvent.keyboard(" ");
  flush();
  await expect.element(controlled).toHaveAttribute("aria-checked", "false");
  await expect.element(page.getByLabelText("requested switch state"))
    .toHaveTextContent("true");

  controlled.element().focus();
  await userEvent.keyboard("{Enter}");
  flush();
  await expect.element(page.getByLabelText("switch submits"))
    .toHaveTextContent("1");
  await expect.element(controlled).toHaveAttribute("aria-checked", "false");

  await expect.element(page.getByRole("switch", { name: "Custom switch" }))
    .not.toHaveAttribute("type");
  await expect.element(
    page.getByRole("switch", { name: "Component switch" }),
  ).toHaveAttribute("type", "button");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

for (
  const scenario of [
    { name: "indeterminate", props: { indeterminate: true }, state: "mixed" },
    { name: "default checked", props: { defaultChecked: true }, state: "true" },
    { name: "unchecked", props: {}, state: "false" },
  ] as const
) {
  test(`Checkbox preserves the upstream ${scenario.name} rendering state`, () => {
    const diagnostics = DEV?.diagnostics.capture();
    mount(() => <Checkbox {...scenario.props} />);
    const checkbox = page.getByRole("checkbox");
    expect(checkbox.element().getAttribute("aria-checked")).toBe(
      scenario.state,
    );
    expect(diagnostics?.stop() ?? []).toEqual([]);
  });
}

function ControlledCheckbox() {
  const [checked, setChecked] = createSignal(false);
  return (
    <Checkbox checked={checked()} onChange={setChecked}>
      Checkbox
    </Checkbox>
  );
}

for (const mode of ["uncontrolled", "controlled"] as const) {
  test(`Checkbox toggles with Space in ${mode} mode`, async () => {
    const diagnostics = DEV?.diagnostics.capture();
    mount(() =>
      mode === "controlled"
        ? <ControlledCheckbox />
        : <Checkbox>Checkbox</Checkbox>
    );
    const checkbox = page.getByRole("checkbox");
    checkbox.element().focus();
    await userEvent.keyboard(" ");
    flush();
    expect(checkbox.element().getAttribute("aria-checked")).toBe("true");
    await userEvent.keyboard(" ");
    flush();
    expect(checkbox.element().getAttribute("aria-checked")).toBe("false");
    expect(diagnostics?.stop() ?? []).toEqual([]);
  });

  test(`Checkbox toggles with clicks in ${mode} mode`, async () => {
    const diagnostics = DEV?.diagnostics.capture();
    mount(() =>
      mode === "controlled"
        ? <ControlledCheckbox />
        : <Checkbox>Checkbox</Checkbox>
    );
    const checkbox = page.getByRole("checkbox");
    await checkbox.click();
    flush();
    expect(checkbox.element().getAttribute("aria-checked")).toBe("true");
    await checkbox.click();
    flush();
    expect(checkbox.element().getAttribute("aria-checked")).toBe("false");
    expect(diagnostics?.stop() ?? []).toEqual([]);
  });
}

for (const checked of [true, false] as const) {
  test(`Switch preserves ${checked ? "on" : "off"} state with as=span`, () => {
    const diagnostics = DEV?.diagnostics.capture();
    mount(() => (
      <Switch as="span" checked={checked} onChange={() => {}}>
        {checked ? "On span" : "Off span"}
      </Switch>
    ));
    const control = page.getByRole("switch");
    expect(control.element()).toBeInstanceOf(HTMLSpanElement);
    expect(control.element().getAttribute("aria-checked")).toBe(
      String(checked),
    );
    expect(diagnostics?.stop() ?? []).toEqual([]);
  });
}

for (
  const scenario of [
    { name: "default", expected: "0", tabindex: undefined },
    { name: "positive override", expected: "3", tabindex: 3 },
    { name: "negative-one safeguard", expected: "0", tabindex: -1 },
  ] as const
) {
  test(`Switch preserves the upstream ${scenario.name} tabindex`, () => {
    const diagnostics = DEV?.diagnostics.capture();
    mount(() => <Switch tabindex={scenario.tabindex}>Tab target</Switch>);
    expect(page.getByRole("switch").element().getAttribute("tabindex")).toBe(
      scenario.expected,
    );
    expect(diagnostics?.stop() ?? []).toEqual([]);
  });
}

test("Switch resolves native and polymorphic button types", () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <>
      <Switch id="default-type">Default type</Switch>
      <Switch id="explicit-type" type="submit">Explicit type</Switch>
      <Switch id="component-button" as={CustomButton}>Component button</Switch>
      <Switch id="native-div" as="div">Native div</Switch>
      <Switch id="component-div" as={CustomDiv}>Component div</Switch>
    </>
  ));
  expect(host?.querySelector("#default-type")?.getAttribute("type")).toBe(
    "button",
  );
  expect(host?.querySelector("#explicit-type")?.getAttribute("type")).toBe(
    "submit",
  );
  expect(host?.querySelector("#component-button")?.getAttribute("type")).toBe(
    "button",
  );
  expect(host?.querySelector("#native-div")?.hasAttribute("type")).toBe(false);
  expect(host?.querySelector("#component-div")?.hasAttribute("type")).toBe(
    false,
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Switch preserves uncontrolled values, reset, and onChange ordering", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const changes: boolean[] = [];
  const submissions: Record<string, FormDataEntryValue>[] = [];

  mount(() => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submissions.push(Object.fromEntries(new FormData(event.currentTarget)));
      }}
    >
      <Switch
        id="plain-value-switch"
        name="notifications"
        onChange={(value) => changes.push(value)}
      >
        Notifications
      </Switch>
      <Switch id="string-value-switch" name="feature" value="enabled">
        Feature
      </Switch>
      <Switch
        id="default-value-switch"
        name="assignee"
        value="bob"
        defaultChecked
      >
        Assignee
      </Switch>
      <button type="submit">Submit values</button>
      <button type="reset">Reset values</button>
    </form>
  ));

  await page.getByRole("button", { name: "Submit values" }).click();
  expect(submissions.at(-1)).toEqual({ assignee: "bob" });

  const plain = page.getByRole("switch", { name: "Notifications" });
  await plain.click();
  await plain.click();
  await plain.click();
  await page.getByRole("switch", { name: "Feature" }).click();
  await page.getByRole("switch", { name: "Assignee" }).click();
  flush();
  expect(changes).toEqual([true, false, true]);

  await page.getByRole("button", { name: "Submit values" }).click();
  expect(submissions.at(-1)).toEqual({
    feature: "enabled",
    notifications: "on",
  });

  await page.getByRole("button", { name: "Reset values" }).click();
  flush();
  await page.getByRole("button", { name: "Submit values" }).click();
  expect(submissions.at(-1)).toEqual({ assignee: "bob" });
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Switch static Group aliases link labels and descriptions in either order", () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <>
      <Switch.Group>
        <Switch.Label>Before label</Switch.Label>
        <Switch.Description>Before description</Switch.Description>
        <Switch id="before-switch">Before contents</Switch>
      </Switch.Group>
      <Switch.Group>
        <Switch id="after-switch">After contents</Switch>
        <Switch.Label>After label</Switch.Label>
        <Switch.Description>After description</Switch.Description>
      </Switch.Group>
    </>
  ));
  for (const order of ["before", "after"] as const) {
    const control = host?.querySelector(`#${order}-switch`);
    const label = page.getByText(
      `${order === "before" ? "Before" : "After"} label`,
      {
        exact: true,
      },
    ).element();
    const description = page.getByText(
      `${order === "before" ? "Before" : "After"} description`,
      { exact: true },
    ).element();
    expect(control?.getAttribute("aria-labelledby")?.split(/\s+/)).toContain(
      label.id,
    );
    expect(control?.getAttribute("aria-describedby")?.split(/\s+/)).toContain(
      description.id,
    );
  }
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Switch Enter submits without toggling when a submitter exists", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const changes: boolean[] = [];
  const submissions: Record<string, FormDataEntryValue>[] = [];
  mount(() => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submissions.push(Object.fromEntries(new FormData(event.currentTarget)));
      }}
    >
      <Switch
        defaultChecked
        name="option"
        onChange={(value) => changes.push(value)}
      >
        Enter target
      </Switch>
      <button type="submit">Submit form</button>
    </form>
  ));
  const control = page.getByRole("switch", { name: "Enter target" });
  control.element().focus();
  await userEvent.keyboard("{Enter}");
  flush();
  expect(control.element().getAttribute("aria-checked")).toBe("true");
  expect(changes).toEqual([]);
  expect(submissions).toEqual([{ option: "on" }]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Switch can be tabbed away from and toggled directly", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <>
      <Switch>Toggle target</Switch>
      <button type="button">Other element</button>
    </>
  ));
  const control = page.getByRole("switch", { name: "Toggle target" });
  control.element().focus();
  await userEvent.keyboard("{Tab}");
  expect(document.activeElement).toBe(
    page.getByRole("button", { name: "Other element" }).element(),
  );
  await control.click();
  flush();
  expect(control.element().getAttribute("aria-checked")).toBe("true");
  await control.click();
  flush();
  expect(control.element().getAttribute("aria-checked")).toBe("false");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Switch label hover styles its control through an explicit Solid group target", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <>
      <style>
        {`
          .switch-hover-control { background-color: rgb(0, 255, 0); }
          .switch-hover-group:has(label:hover) .switch-hover-control {
            background-color: rgb(255, 0, 0);
          }
        `}
      </style>
      <SwitchGroup as="div" class="switch-hover-group">
        <Switch class="switch-hover-control">Hover target</Switch>
        <SwitchLabel>Hover label</SwitchLabel>
      </SwitchGroup>
    </>
  ));

  const control = page.getByRole("switch", { name: "Hover label" });
  await expect.poll(
    () => getComputedStyle(control.element()).backgroundColor,
  ).toBe("rgb(0, 255, 0)");

  // An associated label is not an ancestor of its control, so the platform
  // does not transfer the `:hover` pseudo-class between those siblings. The
  // Solid adaptation makes the styling boundary explicit and uses relational
  // CSS to preserve the upstream test's observable label-hover result.
  await page.getByText("Hover label", { exact: true }).hover();
  await expect.poll(
    () => getComputedStyle(control.element()).backgroundColor,
  ).toBe("rgb(255, 0, 0)");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Switch forwards form ownership to its hidden field", () => {
  const diagnostics = DEV?.diagnostics.capture();
  mount(() => (
    <>
      <Switch
        form="external-switch-form"
        name="notifications"
        defaultChecked
      >
        External switch
      </Switch>
      <form id="external-switch-form" />
    </>
  ));
  const form = host?.querySelector<HTMLFormElement>("#external-switch-form");
  if (!form) throw new Error("Expected external switch form");
  expect(Object.fromEntries(new FormData(form))).toEqual({
    notifications: "on",
  });
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

for (
  const scenario of [
    {
      name: "boolean default value",
      props: { checked: true, name: "notifications" },
      expected: { notifications: "on" },
    },
    {
      name: "provided string value",
      props: { checked: true, name: "fruit", value: "apple" },
      expected: { fruit: "apple" },
    },
    {
      name: "disabled omission",
      props: {
        checked: true,
        disabled: true,
        name: "fruit",
        value: "apple",
      },
      expected: {},
    },
  ] as const
) {
  test(`Switch form encoding preserves ${scenario.name}`, () => {
    const diagnostics = DEV?.diagnostics.capture();
    mount(() => (
      <form>
        <Switch {...scenario.props}>Encoded switch</Switch>
      </form>
    ));
    const form = host?.querySelector("form");
    if (!form) throw new Error("Expected switch form");
    expect(Object.fromEntries(new FormData(form))).toEqual(scenario.expected);
    expect(diagnostics?.stop() ?? []).toEqual([]);
  });
}
