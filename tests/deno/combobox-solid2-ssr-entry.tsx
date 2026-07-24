import { renderToString } from "@solidjs/web";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxLabel,
  ComboboxOption,
  ComboboxOptions,
} from "../../src/components/combobox/combobox.tsx";

export function renderClosedCombobox(): string {
  return renderToString(() => (
    <Combobox value="alpha">
      <ComboboxLabel>Person</ComboboxLabel>
      <ComboboxInput />
      <ComboboxButton>Toggle</ComboboxButton>
      <ComboboxOptions>
        <ComboboxOption value="alpha">Alpha</ComboboxOption>
      </ComboboxOptions>
    </Combobox>
  ));
}

export function renderOpenCombobox(): string {
  return renderToString(() => (
    <Combobox value={{ id: 2, name: "Bravo" }} by="id" __demoMode>
      {({ activeIndex, activeOption, open }) => (
        <div
          data-active-index={activeIndex ?? "none"}
          data-active-option={activeOption?.name ?? "none"}
          data-open={open ? "yes" : "no"}
        >
          <Combobox.Label>People</Combobox.Label>
          <Combobox.Input
            displayValue={(person: { id: number; name: string }) => person.name}
          />
          <Combobox.Button>Choose</Combobox.Button>
          <Combobox.Options static>
            <Combobox.Option value={{ id: 1, name: "Alpha" }}>
              Alpha
            </Combobox.Option>
            <Combobox.Option value={{ id: 2, name: "Bravo" }} disabled>
              Bravo
            </Combobox.Option>
          </Combobox.Options>
        </div>
      )}
    </Combobox>
  ));
}

export function renderMultipleForm(): string {
  return renderToString(() => (
    <Combobox
      multiple
      name="people"
      value={[{ id: 1, name: "Alpha" }, { id: 2, name: "Bravo" }]}
    >
      <ComboboxInput />
      <ComboboxButton>Choose</ComboboxButton>
    </Combobox>
  ));
}

export function renderRetainedCombobox(): string {
  return renderToString(() => (
    <Combobox>
      <ComboboxInput />
      <ComboboxOptions unmount={false}>
        <ComboboxOption value="retained">Retained</ComboboxOption>
      </ComboboxOptions>
    </Combobox>
  ));
}

export function renderOrphanInput(): string {
  return renderToString(() => <ComboboxInput />);
}

export function renderOrphanLabel(): string {
  return renderToString(() => <ComboboxLabel>Orphan</ComboboxLabel>);
}

export function renderOrphanButton(): string {
  return renderToString(() => <ComboboxButton>Orphan</ComboboxButton>);
}

export function renderOrphanOptions(): string {
  return renderToString(() => <ComboboxOptions>Orphan</ComboboxOptions>);
}

export function renderOrphanOption(): string {
  return renderToString(() => (
    <ComboboxOption value="orphan">Orphan</ComboboxOption>
  ));
}

// Keep direct named exports referenced so Deno checks the complete family.
export const namedFamily = {
  ComboboxButton,
  ComboboxInput,
  ComboboxLabel,
  ComboboxOption,
  ComboboxOptions,
};
