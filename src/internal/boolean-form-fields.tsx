import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  type Element,
  For,
} from "solid-js";
import { objectToFormEntries } from "../utils/form.ts";

export interface BooleanFormFieldsProps {
  checked: Accessor<boolean>;
  defaultChecked: boolean | undefined;
  disabled: Accessor<boolean>;
  form: Accessor<string | undefined>;
  name: Accessor<string>;
  onReset: () => void;
  value: Accessor<unknown>;
}

export function BooleanFormFields(props: BooleanFormFieldsProps): Element {
  const [resolver, setResolver] = createSignal<HTMLInputElement | null>(null);
  const entries = createMemo(() =>
    objectToFormEntries({ [props.name()]: props.value() })
  );

  createEffect(
    () => resolver()?.form ?? null,
    (form) => {
      if (!form) return;

      const handleReset = () => props.onReset();
      form.addEventListener("reset", handleReset);
      return () => form.removeEventListener("reset", handleReset);
    },
  );

  return (
    <>
      <input
        aria-hidden="true"
        form={props.form()}
        hidden
        readonly
        ref={setResolver}
        style={{ display: "none" }}
        tabindex={-1}
        type="hidden"
      />
      <For each={entries()}>
        {(entry) => (
          <input
            aria-hidden="true"
            checked={props.checked()}
            defaultChecked={props.defaultChecked ?? false}
            disabled={props.disabled()}
            form={props.form()}
            hidden
            name={entry[0]}
            readonly
            style={{ display: "none" }}
            tabindex={-1}
            type="checkbox"
            value={entry[1]}
          />
        )}
      </For>
    </>
  );
}
