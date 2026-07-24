import { type Accessor, createSignal, flush, untrack } from "solid-js";

export interface BooleanControlOptions {
  checked: Accessor<boolean | undefined>;
  defaultChecked: Accessor<boolean | undefined>;
  onChange: Accessor<((checked: boolean) => void) | undefined>;
}

export interface BooleanControl {
  checked: Accessor<boolean>;
  change(checked: boolean): void;
  readonly defaultChecked: boolean | undefined;
  reset(): void;
}

/**
 * A controlled/uncontrolled boolean with Headless UI's same-turn form
 * invariant: an uncontrolled value reaches the hidden input before onChange.
 */
export function createBooleanControl(
  options: BooleanControlOptions,
): BooleanControl {
  const defaultChecked = untrack(options.defaultChecked);
  const [internalChecked, setInternalChecked] = createSignal(
    defaultChecked ?? false,
  );

  const checked = () => options.checked() ?? internalChecked();

  const change = (nextChecked: boolean) => {
    if (options.checked() === undefined) {
      flush(() => setInternalChecked(nextChecked));
    }
    options.onChange()?.(nextChecked);
  };

  return {
    checked,
    change,
    defaultChecked,
    reset() {
      if (defaultChecked !== undefined) change(defaultChecked);
    },
  };
}
