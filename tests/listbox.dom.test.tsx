import { render } from "@solidjs/web";
import { DEV, type Element, flush, merge } from "solid-js";
import { afterEach, expect, test } from "vitest";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  ListboxSelectedOption,
  type ListboxSelectedOptionProps,
} from "../src/components/listbox/listbox.tsx";

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

test("ListboxSelectedOption composes children onto merged reactive props", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  function ProxiedSelectedOption(): Element {
    const props = merge(
      () => ({
        get options() {
          return (
            <>
              <ListboxOption value="alice">Projected Alice</ListboxOption>
              <ListboxOption value="bob">Projected Bob</ListboxOption>
            </>
          );
        },
      }),
      () => ({ placeholder: "Choose" }),
    );
    return ListboxSelectedOption(
      props as ListboxSelectedOptionProps,
    );
  }

  const root = mount(() => (
    <Listbox defaultValue="bob">
      <ListboxButton id="projected-selection">
        <ProxiedSelectedOption />
      </ListboxButton>
      <ListboxOptions static modal={false}>
        <ListboxOption value="alice">Alice</ListboxOption>
        <ListboxOption value="bob">Bob</ListboxOption>
      </ListboxOptions>
    </Listbox>
  ));
  await settle();

  expect(root.querySelector("#projected-selection")?.textContent).toBe(
    "Projected Bob",
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("uncontrolled Listboxes reset to their implicit single and multi defaults", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const root = mount(() => (
    <form id="implicit-listbox-form">
      <Listbox name="single">
        {(slot) => (
          <>
            <output id="single-listbox-value">
              {slot.value ?? "none"}
            </output>
            <ListboxButton id="single-listbox-button">Single</ListboxButton>
            <ListboxOptions static modal={false}>
              <ListboxOption id="single-listbox-option" value="alpha">
                Alpha
              </ListboxOption>
            </ListboxOptions>
          </>
        )}
      </Listbox>
      <Listbox<"div", string[], string> multiple name="multiple">
        {(slot) => (
          <>
            <output id="multi-listbox-value">
              {slot.value.join(",") || "none"}
            </output>
            <ListboxButton id="multi-listbox-button">Multiple</ListboxButton>
            <ListboxOptions static modal={false}>
              <ListboxOption id="multi-listbox-option" value="beta">
                Beta
              </ListboxOption>
            </ListboxOptions>
          </>
        )}
      </Listbox>
    </form>
  ));
  await settle();

  root.querySelector<HTMLElement>("#single-listbox-button")!.click();
  root.querySelector<HTMLElement>("#single-listbox-option")!.click();
  root.querySelector<HTMLElement>("#multi-listbox-button")!.click();
  root.querySelector<HTMLElement>("#multi-listbox-option")!.click();
  await settle();

  const form = root.querySelector<HTMLFormElement>("#implicit-listbox-form")!;
  expect(root.querySelector("#single-listbox-value")?.textContent).toBe(
    "alpha",
  );
  expect(root.querySelector("#multi-listbox-value")?.textContent).toBe(
    "beta",
  );
  expect([...new FormData(form).entries()]).toEqual([
    ["single", "alpha"],
    ["multiple[0]", "beta"],
  ]);

  form.reset();
  await settle();
  expect(root.querySelector("#single-listbox-value")?.textContent).toBe(
    "none",
  );
  expect(root.querySelector("#multi-listbox-value")?.textContent).toBe(
    "none",
  );
  expect([...new FormData(form).entries()]).toEqual([]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
