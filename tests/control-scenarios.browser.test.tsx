import { render } from "@solidjs/web";
import { DEV, type Element, flush } from "solid-js";
import { afterEach, describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  Checkbox,
  Description,
  Field,
  Fieldset,
  Input,
  Label,
  Select,
  Textarea,
} from "../src/index.ts";

interface SharedControlProps {
  disabled?: boolean;
  id?: string;
  name?: string;
}

interface ControlScenarioConfig {
  getControl(host: HTMLElement): HTMLElement | null;
  interact(control: HTMLElement): Promise<void> | void;
  name: string;
  render(props: SharedControlProps): Element;
  renderForForm(props: SharedControlProps): Element;
}

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  host?.remove();
  dispose = undefined;
  host = undefined;
});

function mount(children: () => Element): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(children, host);
  flush();
  return host;
}

function parityTest(
  name: string,
  run: () => Promise<void> | void,
): void {
  test(name, async () => {
    const diagnostics = DEV?.diagnostics.capture();
    try {
      await run();
    } finally {
      expect(diagnostics?.stop() ?? []).toEqual([]);
    }
  });
}

function controlFor(
  config: ControlScenarioConfig,
  container = host,
): HTMLElement {
  const control = container ? config.getControl(container) : null;
  if (!control) throw new Error(`Expected a ${config.name} control`);
  return control;
}

function idsFor(selector: string): string[] {
  if (!host) throw new Error("Expected a mounted host");
  return [...host.querySelectorAll<HTMLElement>(selector)].map((element) => {
    if (!element.id) throw new Error(`Expected ${selector} to have an id`);
    return element.id;
  });
}

function expectIdRefs(
  control: HTMLElement,
  attribute: "aria-describedby" | "aria-labelledby",
  expected: readonly string[],
): void {
  expect(control.getAttribute(attribute)?.split(/\s+/)).toEqual(expected);
}

function expectDisabled(control: HTMLElement): void {
  expect(
    control.matches(":disabled") ||
      control.getAttribute("aria-disabled") === "true",
  ).toBe(true);
}

parityTest("Select focus state follows keyboard modality", async () => {
  mount(() => (
    <>
      <button type="button">Before</button>
      <Select aria-label="Release channel">
        <option value="stable">Stable</option>
        <option value="beta">Beta</option>
      </Select>
    </>
  ));

  const select = host?.querySelector<HTMLSelectElement>("select");
  if (!select) throw new Error("Expected a Select control");

  await page.getByRole("combobox", { name: "Release channel" }).click();
  expect(select.hasAttribute("data-focus")).toBe(false);

  host?.querySelector<HTMLButtonElement>("button")?.focus();
  await userEvent.tab();
  flush();

  expect(document.activeElement).toBe(select);
  expect(select.hasAttribute("data-focus")).toBe(true);
});

function formEntries(form: HTMLFormElement): [string, FormDataEntryValue][] {
  return [...new FormData(form).entries()];
}

/**
 * Solid adaptation of the 18 cases in React's test-utils/scenarios.tsx.
 * Keeping registration explicit preserves the upstream per-control count.
 */
function registerCommonControlScenarios(config: ControlScenarioConfig): void {
  describe(`${config.name}: upstream shared scenarios`, () => {
    describe("Rendering", () => {
      parityTest("renders a control", () => {
        const container = mount(() => config.render({}));
        expect(config.getControl(container)).not.toBeNull();
      });

      parityTest("attaches a generated id", () => {
        mount(() => config.render({}));
        expect(controlFor(config).id).not.toBe("");
      });

      parityTest("allows the id to be overridden", () => {
        mount(() => config.render({ id: "foo" }));
        expect(controlFor(config).id).toBe("foo");
      });
    });

    describe("Field composition", () => {
      parityTest("inherits disabled state from Field", () => {
        mount(() => <Field disabled>{config.render({})}</Field>);
        expectDisabled(controlFor(config));
      });

      parityTest("links one Label", () => {
        mount(() => (
          <Field>
            <Label>My Label</Label>
            {config.render({})}
          </Field>
        ));
        expectIdRefs(
          controlFor(config),
          "aria-labelledby",
          idsFor("[id^='headlessui-label-']"),
        );
      });

      parityTest("links multiple Labels in registration order", () => {
        mount(() => (
          <Field>
            <Label>My Label #1</Label>
            <Label>My Label #2</Label>
            {config.render({})}
          </Field>
        ));
        expectIdRefs(
          controlFor(config),
          "aria-labelledby",
          idsFor("[id^='headlessui-label-']"),
        );
      });

      parityTest("links one Description", () => {
        mount(() => (
          <Field>
            {config.render({})}
            <Description>My Description</Description>
          </Field>
        ));
        expectIdRefs(
          controlFor(config),
          "aria-describedby",
          idsFor("[id^='headlessui-description-']"),
        );
      });

      parityTest("links multiple Descriptions in registration order", () => {
        mount(() => (
          <Field>
            {config.render({})}
            <Description>My Description #1</Description>
            <Description>My Description #2</Description>
            <Description>My Description #3</Description>
          </Field>
        ));
        expectIdRefs(
          controlFor(config),
          "aria-describedby",
          idsFor("[id^='headlessui-description-']"),
        );
      });

      parityTest("links both Label and Description", () => {
        mount(() => (
          <Field>
            <Label>My Label</Label>
            {config.render({})}
            <Description>My Description</Description>
          </Field>
        ));
        const control = controlFor(config);
        expectIdRefs(
          control,
          "aria-labelledby",
          idsFor("[id^='headlessui-label-']"),
        );
        expectIdRefs(
          control,
          "aria-describedby",
          idsFor("[id^='headlessui-description-']"),
        );
      });
    });

    describe("Label interactions", () => {
      parityTest("clicking a Label focuses the control", async () => {
        mount(() => (
          <Field>
            <Label>My Label</Label>
            {config.render({})}
          </Field>
        ));
        await page.getByText("My Label", { exact: true }).click();
        flush();
        expect(document.activeElement).toBe(controlFor(config));
      });

      parityTest("a passive Label does not focus the control", async () => {
        mount(() => (
          <Field>
            <Label passive>My Label</Label>
            {config.render({})}
          </Field>
        ));
        await page.getByText("My Label", { exact: true }).click();
        flush();
        expect(document.activeElement).not.toBe(controlFor(config));
      });

      parityTest("a Label does not focus a disabled control", () => {
        mount(() => (
          <Field>
            <Label>My Label</Label>
            {config.render({ disabled: true })}
          </Field>
        ));
        host?.querySelector<HTMLLabelElement>("label")?.click();
        flush();
        expect(document.activeElement).not.toBe(controlFor(config));
      });

      parityTest(
        "a Label does not focus a control in a disabled Field",
        () => {
          mount(() => (
            <Field disabled>
              <Label>My Label</Label>
              {config.render({})}
            </Field>
          ));
          host?.querySelector<HTMLLabelElement>("label")?.click();
          flush();
          expect(document.activeElement).not.toBe(controlFor(config));
        },
      );

      parityTest(
        "a Label does not focus a control in a disabled Fieldset",
        () => {
          mount(() => (
            <Fieldset disabled>
              <Field>
                <Label>My Label</Label>
                {config.render({})}
              </Field>
            </Fieldset>
          ));
          host?.querySelector<HTMLLabelElement>("label")?.click();
          flush();
          expect(document.activeElement).not.toBe(controlFor(config));
        },
      );
    });

    describe("Form compatibility", () => {
      parityTest("renders a native form field for name", () => {
        mount(() => <form>{config.renderForForm({ name: "foo" })}</form>);
        expect(host?.querySelector("[name='foo']")).not.toBeNull();
      });

      parityTest("submits its named data", () => {
        let submitted: [string, FormDataEntryValue][] = [];
        mount(() => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitted = formEntries(event.currentTarget);
            }}
          >
            {config.renderForForm({ name: "foo" })}
            <button type="submit">Submit</button>
          </form>
        ));
        host?.querySelector<HTMLButtonElement>("button[type='submit']")
          ?.click();
        flush();
        expect(submitted.some(([name]) => name === "foo")).toBe(true);
      });

      parityTest("omits disabled data from submission", () => {
        let submitted: [string, FormDataEntryValue][] = [];
        mount(() => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitted = formEntries(event.currentTarget);
            }}
          >
            <input type="hidden" name="foo" value="bar" />
            {config.renderForForm({ name: "bar", disabled: true })}
            <button type="submit">Submit</button>
          </form>
        ));
        host?.querySelector<HTMLButtonElement>("button[type='submit']")
          ?.click();
        flush();
        expect(submitted).toEqual([["foo", "bar"]]);
      });

      parityTest("resets to its initial form value", async () => {
        const submissions: [string, FormDataEntryValue][][] = [];
        mount(() => (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submissions.push(formEntries(event.currentTarget));
            }}
          >
            <Field>
              <Label>The Label</Label>
              {config.renderForForm({ name: "foo" })}
            </Field>
            <button type="submit">Submit</button>
            <button type="reset">Reset</button>
          </form>
        ));
        const submit = host?.querySelector<HTMLButtonElement>(
          "button[type='submit']",
        );
        const reset = host?.querySelector<HTMLButtonElement>(
          "button[type='reset']",
        );
        if (!submit || !reset) throw new Error("Expected form controls");

        submit.click();
        await config.interact(controlFor(config));
        flush();
        submit.click();
        expect(submissions[1]).not.toEqual(submissions[0]);

        reset.click();
        flush();
        submit.click();
        expect(submissions[2]).toEqual(submissions[0]);
      });
    });
  });
}

registerCommonControlScenarios({
  name: "Input",
  render: (props) => <Input {...props} />,
  renderForForm: (props) => <Input {...props} />,
  getControl: (container) => container.querySelector("input"),
  interact(control) {
    const input = control as HTMLInputElement;
    input.value = "alice";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  },
});

registerCommonControlScenarios({
  name: "Select",
  render: (props) => (
    <Select {...props}>
      <option value="alice">Alice</option>
      <option value="bob">Bob</option>
      <option value="charlie">Charlie</option>
    </Select>
  ),
  renderForForm: (props) => (
    <Select {...props}>
      <option value="alice">Alice</option>
      <option value="bob" selected>Bob</option>
      <option value="charlie">Charlie</option>
    </Select>
  ),
  getControl: (container) => container.querySelector("select"),
  interact(control) {
    const select = control as HTMLSelectElement;
    select.value = "alice";
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  },
});

registerCommonControlScenarios({
  name: "Textarea",
  render: (props) => <Textarea {...props} />,
  renderForForm: (props) => <Textarea {...props} />,
  getControl: (container) => container.querySelector("textarea"),
  interact(control) {
    const textarea = control as HTMLTextAreaElement;
    textarea.value = "alice";
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  },
});

registerCommonControlScenarios({
  name: "Checkbox",
  render: (props) => <Checkbox {...props} />,
  renderForForm: (props) => <Checkbox defaultChecked {...props} />,
  getControl: (container) => container.querySelector("[role='checkbox']"),
  interact(control) {
    control.click();
  },
});
