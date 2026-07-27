import { render } from "@solidjs/web";
import { createSignal, DEV, type Element, flush } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { Checkbox } from "../src/components/checkbox/checkbox.tsx";
import { Switch } from "../src/components/switch/switch.tsx";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

function mount(view: () => Element): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(view, host);
  flush();
  return host;
}

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  await settle();
  host?.remove();
  host = undefined;
  document.body.replaceChildren();
});

test("Checkbox and Switch rebind reactive form owners and reset to false", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let moveToExternalForm = () => {};

  const root = mount(() => {
    const [formId, setFormId] = createSignal<string>();
    moveToExternalForm = () => setFormId("new-boolean-form");

    return (
      <>
        <form id="old-boolean-form">
          <Checkbox
            id="reactive-form-checkbox"
            form={formId()}
            name="checkbox"
          >
            Checkbox
          </Checkbox>
          <Switch
            id="reactive-form-switch"
            form={formId()}
            name="switch"
          >
            Switch
          </Switch>
        </form>
        <form id="new-boolean-form" />
      </>
    );
  });
  await settle();

  const checkbox = root.querySelector<HTMLElement>(
    "#reactive-form-checkbox",
  )!;
  const switchElement = root.querySelector<HTMLElement>(
    "#reactive-form-switch",
  )!;
  const oldForm = root.querySelector<HTMLFormElement>("#old-boolean-form")!;
  const newForm = root.querySelector<HTMLFormElement>("#new-boolean-form")!;

  checkbox.click();
  switchElement.click();
  await settle();
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
  expect(switchElement.getAttribute("aria-checked")).toBe("true");
  expect(Object.fromEntries(new FormData(oldForm))).toEqual({
    checkbox: "on",
    switch: "on",
  });

  moveToExternalForm();
  await settle();
  expect(Object.fromEntries(new FormData(oldForm))).toEqual({});
  expect(Object.fromEntries(new FormData(newForm))).toEqual({
    checkbox: "on",
    switch: "on",
  });

  oldForm.reset();
  await settle();
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
  expect(switchElement.getAttribute("aria-checked")).toBe("true");

  newForm.reset();
  await settle();
  expect(checkbox.getAttribute("aria-checked")).toBe("false");
  expect(switchElement.getAttribute("aria-checked")).toBe("false");
  expect(Object.fromEntries(new FormData(newForm))).toEqual({});
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Checkbox and Switch preserve explicit falsy form values", () => {
  const diagnostics = DEV?.diagnostics.capture();
  const root = mount(() => (
    <form>
      <Checkbox checked name="empty" value="">Empty</Checkbox>
      <Checkbox checked name="zero" value={0}>Zero</Checkbox>
      <Checkbox checked name="false" value={false}>False</Checkbox>
      <Switch checked name="switch-empty" value="">Switch empty</Switch>
    </form>
  ));
  const form = root.querySelector("form")!;

  expect(Object.fromEntries(new FormData(form))).toEqual({
    empty: "",
    false: "0",
    "switch-empty": "",
    zero: "0",
  });
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
