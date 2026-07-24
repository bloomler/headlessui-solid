import { renderToString } from "@solidjs/web";
import type { Element } from "solid-js";
import {
  Listbox,
  ListboxButton,
  ListboxLabel,
  ListboxOption,
  ListboxOptions,
  ListboxSelectedOption,
} from "../../src/components/listbox/listbox.tsx";

interface Person {
  id: number;
  name: string;
}

function PeopleListbox(props: { multiple?: boolean }): Element {
  const value = props.multiple
    ? [{ id: 2, name: "Bob" }]
    : { id: 2, name: "Bob" };
  return (
    <Listbox
      by="id"
      value={value}
      name="person"
      multiple={props.multiple}
    >
      {(root) => (
        <>
          <output data-open>{String(root.open)}</output>
          <ListboxLabel id="people-label">Person</ListboxLabel>
          <ListboxButton id="people-button">
            {(button) => (
              <>
                <span data-button-value>{JSON.stringify(button.value)}</span>
                <ListboxSelectedOption
                  placeholder="Choose a person"
                  options={
                    <>
                      <ListboxOption value={{ id: 1, name: "Alice" }}>
                        {(option) =>
                          option.selectedOption ? "Selected Alice" : "Alice"}
                      </ListboxOption>
                      <ListboxOption value={{ id: 2, name: "Bob" }}>
                        {(option) =>
                          option.selectedOption ? "Selected Bob" : "Bob"}
                      </ListboxOption>
                    </>
                  }
                />
              </>
            )}
          </ListboxButton>
          <ListboxOptions id="people-options" static>
            <ListboxOption id="alice-option" value={{ id: 1, name: "Alice" }}>
              Alice
            </ListboxOption>
            <ListboxOption id="bob-option" value={{ id: 2, name: "Bob" }}>
              Bob
            </ListboxOption>
            <ListboxOption
              id="carol-option"
              value={{ id: 3, name: "Carol" }}
              disabled
            >
              Carol
            </ListboxOption>
          </ListboxOptions>
        </>
      )}
    </Listbox>
  );
}

export function renderSingleListbox(): string {
  return renderToString(() => <PeopleListbox />);
}

export function renderMultipleListbox(): string {
  return renderToString(() => <PeopleListbox multiple />);
}

export function renderPlaceholder(): string {
  return renderToString(() => (
    <Listbox value={undefined as Person | undefined}>
      <ListboxButton>
        <ListboxSelectedOption
          placeholder="Choose a person"
          options={
            <ListboxOption value={{ id: 1, name: "Alice" }}>
              Alice
            </ListboxOption>
          }
        />
      </ListboxButton>
    </Listbox>
  ));
}

export function renderOrphanButton(): string {
  return renderToString(() => <ListboxButton />);
}

export function renderOrphanLabel(): string {
  return renderToString(() => <ListboxLabel />);
}

export function renderOrphanOption(): string {
  return renderToString(() => <ListboxOption value="orphan" />);
}

export function renderOrphanOptions(): string {
  return renderToString(() => <ListboxOptions />);
}

export function staticsArePreserved(): boolean {
  return Listbox.Button === ListboxButton &&
    Listbox.Label === ListboxLabel &&
    Listbox.Option === ListboxOption &&
    Listbox.Options === ListboxOptions &&
    Listbox.SelectedOption === ListboxSelectedOption;
}
