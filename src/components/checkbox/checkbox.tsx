import {
  createSignal,
  createUniqueId,
  type Element,
  omit,
  onSettled,
  Show,
} from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import { createBooleanControl } from "../../internal/boolean-control.ts";
import { BooleanFormFields } from "../../internal/boolean-form-fields.tsx";
import { useDisabled } from "../../internal/disabled.tsx";
import { useProvidedId } from "../../internal/id.tsx";
import {
  createActivePress,
  createFocusRing,
  createHover,
} from "../../primitives/interactions.ts";
import type { Props, Ref } from "../../types.ts";
import { isDisabledByFieldset } from "../../utils/bugs.ts";
import { disposables } from "../../utils/disposables.ts";
import { attemptSubmit } from "../../utils/form.ts";
import { mergeEventProps, renderElement } from "../../utils/render.tsx";
import { useDescribedBy } from "../description/description.tsx";
import { useLabelledBy } from "../label/label.tsx";

const DEFAULT_CHECKBOX_TAG = "span" as const;

/**
 * Reactive state exposed to render-prop children of the checkbox component.
 */
export type CheckboxRenderPropArg = Readonly<{
  active: boolean;
  autofocus: boolean;
  changing: boolean;
  checked: boolean;
  disabled: boolean;
  focus: boolean;
  hover: boolean;
  indeterminate: boolean;
}>;

type CheckboxPropsWeControl =
  | "aria-checked"
  | "aria-describedby"
  | "aria-disabled"
  | "aria-labelledby"
  | "role";

/**
 * Props accepted by the checkbox component.
 */
export type CheckboxProps<
  TTag extends ValidComponent = typeof DEFAULT_CHECKBOX_TAG,
  TValue = string,
> = Props<
  TTag,
  CheckboxRenderPropArg,
  CheckboxPropsWeControl,
  {
    autofocus?: boolean;
    checked?: boolean;
    defaultChecked?: boolean;
    disabled?: boolean;
    form?: string;
    indeterminate?: boolean;
    name?: string;
    onChange?: (checked: boolean) => void;
    tabindex?: number;
    value?: TValue;
  },
  HTMLElement
>;

/**
 * Renders the accessible, unstyled checkbox component for Solid.
 */
export function Checkbox<
  TTag extends ValidComponent = typeof DEFAULT_CHECKBOX_TAG,
  TValue = string,
>(props: CheckboxProps<TTag, TValue>): Element {
  const generatedId = `headlessui-checkbox-${createUniqueId()}`;
  const providedId = useProvidedId();
  const providedDisabled = useDisabled();
  const labelledBy = useLabelledBy();
  const describedBy = useDescribedBy();
  const disabled = () => props.disabled ?? providedDisabled() ?? false;
  const autofocus = () => Boolean(props.autofocus);
  const indeterminate = () => Boolean(props.indeterminate);
  const control = createBooleanControl({
    checked: () => props.checked,
    defaultChecked: () => props.defaultChecked,
    onChange: () => props.onChange,
  });
  const [changing, setChanging] = createSignal(false);
  const scheduled = disposables();

  onSettled(() => () => scheduled.dispose());

  const toggle = () => {
    setChanging(true);
    control.change(!control.checked());
    scheduled.dispose();
    scheduled.nextFrame(() => setChanging(false));
  };

  const handleClick = (event: MouseEvent & { currentTarget: HTMLElement }) => {
    if (isDisabledByFieldset(event.currentTarget)) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    toggle();
  };

  const handleKeyUp = (
    event: KeyboardEvent & { currentTarget: HTMLElement },
  ) => {
    if (event.key === " ") {
      event.preventDefault();
      toggle();
    } else if (event.key === "Enter") {
      attemptSubmit(event.currentTarget);
    }
  };

  const handleKeyPress = (event: KeyboardEvent) => event.preventDefault();
  const focusRing = createFocusRing({ disabled, focusVisibleOnly: true });
  const hover = createHover({ disabled });
  const activePress = createActivePress({ disabled });

  const slot: CheckboxRenderPropArg = {
    get active() {
      return activePress.pressed();
    },
    get autofocus() {
      return autofocus();
    },
    get changing() {
      return changing();
    },
    get checked() {
      return control.checked();
    },
    get disabled() {
      return disabled();
    },
    get focus() {
      return focusRing.focused();
    },
    get hover() {
      return hover.hovered();
    },
    get indeterminate() {
      return indeterminate();
    },
  };

  const theirProps = omit(
    props,
    "autofocus",
    "checked",
    "defaultChecked",
    "disabled",
    "form",
    "indeterminate",
    "name",
    "onChange",
    "ref",
    "tabindex",
    "value",
  );
  const ourProps = mergeEventProps(
    {
      get ref(): Ref<HTMLElement> {
        return props.ref as Ref<HTMLElement>;
      },
      get id() {
        return props.id ?? providedId() ?? generatedId;
      },
      role: "checkbox",
      get "aria-checked"() {
        return indeterminate() ? "mixed" : control.checked() ? "true" : "false";
      },
      get "aria-labelledby"() {
        return labelledBy();
      },
      get "aria-describedby"() {
        return describedBy();
      },
      get "aria-disabled"() {
        return disabled() ? "true" : undefined;
      },
      get indeterminate() {
        return indeterminate() ? "true" : undefined;
      },
      get tabindex() {
        return disabled() ? undefined : props.tabindex ?? 0;
      },
      get autofocus() {
        return autofocus() || undefined;
      },
      get onClick() {
        return disabled() ? undefined : handleClick;
      },
      get onKeyUp() {
        return disabled() ? undefined : handleKeyUp;
      },
      get onKeyPress() {
        return disabled() ? undefined : handleKeyPress;
      },
    },
    focusRing.focusProps,
    hover.hoverProps,
    activePress.pressProps,
  );

  return (
    <>
      <Show when={props.name != null}>
        <BooleanFormFields
          checked={control.checked}
          defaultChecked={control.defaultChecked}
          disabled={disabled}
          form={() => props.form}
          name={() => props.name!}
          onReset={control.reset}
          value={() => props.value || "on"}
        />
      </Show>
      {renderElement({
        defaultTag: DEFAULT_CHECKBOX_TAG,
        name: "Checkbox",
        ourProps,
        slot,
        stateKeys: [
          "checked",
          "disabled",
          "hover",
          "focus",
          "active",
          "indeterminate",
          "changing",
          "autofocus",
        ],
        theirProps,
      })}
    </>
  );
}
