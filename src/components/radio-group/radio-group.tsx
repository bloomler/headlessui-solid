import {
  type Accessor,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  type Element,
  flush,
  omit,
  onSettled,
  untrack,
  useContext,
} from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import { useDisabled } from "../../internal/disabled.tsx";
import { useProvidedId } from "../../internal/id.tsx";
import { createFocusRing, createHover } from "../../primitives/interactions.ts";
import type { Props, Ref } from "../../types.ts";
import { isDisabledByFieldset } from "../../utils/bugs.ts";
import {
  Focus,
  focusIn,
  FocusResult,
  sortByDomNode,
} from "../../utils/focus-management.ts";
import { attemptSubmit, objectToFormEntries } from "../../utils/form.ts";
import { isActiveElement } from "../../utils/owner.ts";
import type { AnyProps } from "../../utils/merge-event-props.ts";
import { mergeEventProps, renderElement } from "../../utils/render.tsx";
import {
  Description,
  useDescribedBy,
  useDescriptions,
} from "../description/description.tsx";
import { Label, useLabelledBy, useLabels } from "../label/label.tsx";
import {
  type ByComparator,
  compareRadioValues,
  radioFormValue,
  resolveRadioTabIndex,
} from "./radio-group-machine.ts";

export type { ByComparator } from "./radio-group-machine.ts";

interface RegisteredOption<T> {
  readonly disabled: Accessor<boolean>;
  readonly element: Accessor<HTMLElement | null>;
  readonly id: Accessor<string>;
  readonly value: Accessor<T>;
}

interface RadioGroupData<T> {
  readonly compare: (a: T, z: T) => boolean;
  readonly containsCheckedOption: Accessor<boolean>;
  readonly disabled: Accessor<boolean>;
  readonly firstOption: Accessor<RegisteredOption<T> | undefined>;
  readonly options: Accessor<readonly RegisteredOption<T>[]>;
  readonly tabIndex: Accessor<number>;
  readonly value: Accessor<T | undefined>;
}

interface RadioGroupActions<T> {
  change(value: T): boolean;
  registerOption(option: RegisteredOption<T>): () => void;
}

const RadioGroupDataContext = createContext<RadioGroupData<unknown>>();
const RadioGroupActionsContext = createContext<RadioGroupActions<unknown>>();

function createOptionRegistry<T>() {
  const registered: RegisteredOption<T>[] = [];
  const [version, setVersion] = createSignal(0, { ownedWrite: true });

  const options = (): readonly RegisteredOption<T>[] => {
    version();
    return sortByDomNode(registered, (option) => option.element());
  };

  const registerOption = (option: RegisteredOption<T>): () => void => {
    registered.push(option);
    setVersion((current) => current + 1);

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const index = registered.indexOf(option);
      if (index === -1) return;
      registered.splice(index, 1);
      setVersion((current) => current + 1);
    };
  };

  return { options, registerOption };
}

const DEFAULT_RADIO_GROUP_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the radio group component.
 */
export type RadioGroupRenderPropArg<TType> = Readonly<{
  value: TType;
}>;

type RadioGroupPropsWeControl =
  | "aria-describedby"
  | "aria-labelledby"
  | "role";

/**
 * Props accepted by the radio group component.
 */
export type RadioGroupProps<
  TTag extends ValidComponent = typeof DEFAULT_RADIO_GROUP_TAG,
  TType = string,
> = Props<
  TTag,
  RadioGroupRenderPropArg<TType>,
  RadioGroupPropsWeControl,
  {
    by?: ByComparator<TType>;
    defaultValue?: TType;
    disabled?: boolean;
    form?: string;
    id?: string;
    name?: string;
    onChange?: (value: TType) => void;
    tabIndex?: number;
    value?: TType;
  },
  HTMLElement
>;

function RadioGroupRoot<
  TTag extends ValidComponent = typeof DEFAULT_RADIO_GROUP_TAG,
  TType = string,
>(props: RadioGroupProps<TTag, TType>): Element {
  const generatedId = `headlessui-radiogroup-${createUniqueId()}`;
  const providedDisabled = useDisabled();
  const [labelledBy, LabelProvider] = useLabels();
  const [describedBy, DescriptionProvider] = useDescriptions();
  const [groupElement, setGroupElement] = createSignal<HTMLElement | null>(
    null,
  );
  const initialDefaultValue = untrack(() => props.defaultValue);
  const [internalValueBox, setInternalValueBox] = createSignal<{
    value: TType | undefined;
  }>({ value: initialDefaultValue });
  const registry = createOptionRegistry<TType>();

  const id = () => props.id ?? generatedId;
  const disabled = () => props.disabled ?? providedDisabled() ?? false;
  const tabIndex = () => props.tabIndex ?? 0;
  const value = (): TType | undefined =>
    props.value !== undefined ? props.value : internalValueBox().value;
  const compare = (a: TType, z: TType) => compareRadioValues(props.by, a, z);

  const firstOption = createMemo(() =>
    registry.options().find((option) => !option.disabled())
  );
  const containsCheckedOption = createMemo(() =>
    registry.options().some((option) =>
      compare(option.value(), value() as TType)
    )
  );

  const change = (nextValue: TType): boolean => {
    if (disabled()) return false;
    if (compare(nextValue, value() as TType)) return false;

    const nextOption = registry.options().find((option) =>
      compare(option.value(), nextValue)
    );
    if (nextOption?.disabled()) return false;

    if (props.value === undefined) {
      flush(() => setInternalValueBox({ value: nextValue }));
    }
    props.onChange?.(nextValue);
    return true;
  };

  const data: RadioGroupData<TType> = {
    compare,
    containsCheckedOption,
    disabled,
    firstOption,
    options: registry.options,
    tabIndex,
    value,
  };
  const actions: RadioGroupActions<TType> = {
    change,
    registerOption: registry.registerOption,
  };

  const handleKeyDown = (
    event: KeyboardEvent & { currentTarget: HTMLElement },
  ): void => {
    if (!groupElement()) return;

    const enabledElements = registry.options()
      .filter((option) => !option.disabled())
      .map((option) => option.element())
      .filter((element): element is HTMLElement => element !== null);

    switch (event.key) {
      case "Enter":
        attemptSubmit(event.currentTarget);
        break;
      case "ArrowLeft":
      case "ArrowUp": {
        event.preventDefault();
        event.stopPropagation();
        const result = focusIn(
          enabledElements,
          Focus.Previous | Focus.WrapAround,
        );
        if (result === FocusResult.Success) {
          const active = registry.options().find((option) =>
            isActiveElement(option.element())
          );
          if (active) change(active.value());
        }
        break;
      }
      case "ArrowRight":
      case "ArrowDown": {
        event.preventDefault();
        event.stopPropagation();
        const result = focusIn(
          enabledElements,
          Focus.Next | Focus.WrapAround,
        );
        if (result === FocusResult.Success) {
          const active = registry.options().find((option) =>
            isActiveElement(option.element())
          );
          if (active) change(active.value());
        }
        break;
      }
      case " ": {
        event.preventDefault();
        event.stopPropagation();
        const active = registry.options().find((option) =>
          isActiveElement(option.element())
        );
        if (active) change(active.value());
        break;
      }
    }
  };

  const reset = (): void => {
    if (initialDefaultValue === undefined && props.value !== undefined) return;

    // The native reset default action runs after the `reset` event. Applying
    // the Solid value synchronously here would let that default action uncheck
    // the newly rendered hidden radio afterwards. Preserve observable browser
    // ordering by committing the initial value in the next microtask.
    queueMicrotask(() => change(initialDefaultValue as TType));
  };

  createEffect(
    () => ({ element: groupElement(), formId: props.form }),
    ({ element, formId }) => {
      if (!element) return;
      const candidate = formId
        ? element.ownerDocument.getElementById(formId)
        : element.closest("form");
      if (!candidate || candidate.tagName !== "FORM") return;

      const form = candidate as HTMLFormElement;
      form.addEventListener("reset", reset);
      return () => form.removeEventListener("reset", reset);
    },
  );

  const formEntries = createMemo(() => {
    const name = props.name;
    if (name === null || name === undefined) return [];
    return objectToFormEntries({ [name]: radioFormValue(value()) });
  });

  const slot: RadioGroupRenderPropArg<TType> = {
    get value() {
      return value() as TType;
    },
  };
  const theirProps = omit(
    props,
    "by",
    "defaultValue",
    "disabled",
    "form",
    "id",
    "name",
    "onChange",
    "ref",
    "tabIndex",
    "value",
  ) as AnyProps;
  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return [props.ref as Ref<HTMLElement>, setGroupElement];
    },
    get id() {
      return id();
    },
    role: "radiogroup",
    get "aria-labelledby"() {
      return labelledBy();
    },
    get "aria-describedby"() {
      return describedBy();
    },
    onKeyDown: handleKeyDown,
  };

  return (
    <DescriptionProvider name="RadioGroup.Description">
      <LabelProvider name="RadioGroup.Label">
        <RadioGroupActionsContext
          value={actions as RadioGroupActions<unknown>}
        >
          <RadioGroupDataContext value={data as RadioGroupData<unknown>}>
            {formEntries().map(([fieldName, fieldValue]) => (
              <input
                type="radio"
                hidden
                readonly
                style={{ display: "none" }}
                form={props.form}
                disabled={disabled() || undefined}
                name={fieldName}
                value={fieldValue}
                checked={value() !== null && value() !== undefined}
              />
            ))}
            {renderElement({
              defaultTag: DEFAULT_RADIO_GROUP_TAG,
              name: "RadioGroup",
              ourProps,
              slot,
              theirProps,
            })}
          </RadioGroupDataContext>
        </RadioGroupActionsContext>
      </LabelProvider>
    </DescriptionProvider>
  );
}

const DEFAULT_OPTION_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the radio option component.
 */
export type RadioOptionRenderPropArg = Readonly<{
  /** @deprecated Use `focus` instead. */
  active: boolean;
  autofocus: boolean;
  checked: boolean;
  disabled: boolean;
  focus: boolean;
  hover: boolean;
}>;

type RadioOptionPropsWeControl =
  | "aria-checked"
  | "aria-describedby"
  | "aria-disabled"
  | "aria-labelledby"
  | "role"
  | "tabIndex"
  | "tabindex";

/**
 * Props accepted by the radio option component.
 */
export type RadioOptionProps<
  TTag extends ValidComponent = typeof DEFAULT_OPTION_TAG,
  TType = string,
> = Props<
  TTag,
  RadioOptionRenderPropArg,
  RadioOptionPropsWeControl,
  {
    autofocus?: boolean;
    disabled?: boolean;
    id?: string;
    value: TType;
  },
  HTMLElement
>;

/** @deprecated Use `<Radio>` instead of `<RadioGroupOption>`. */
/**
 * Renders the option for the radio group component family.
 */
export function RadioGroupOption<
  TTag extends ValidComponent = typeof DEFAULT_OPTION_TAG,
  TType = string,
>(props: RadioOptionProps<TTag, TType>): Element {
  const data = useContext(RadioGroupDataContext) as RadioGroupData<TType>;
  const actions = useContext(
    RadioGroupActionsContext,
  ) as RadioGroupActions<TType>;
  const generatedId = `headlessui-radiogroup-option-${createUniqueId()}`;
  const [element, setElement] = createSignal<HTMLElement | null>(null);
  const [labelledBy, LabelProvider] = useLabels();
  const [describedBy, DescriptionProvider] = useDescriptions();

  const id = () => props.id ?? generatedId;
  const value = () => props.value;
  const disabled = () => props.disabled ?? data.disabled() ?? false;
  const autofocus = () => Boolean(props.autofocus);
  const checked = () => data.compare(data.value() as TType, value());
  const isFirstOption = () => data.firstOption()?.id() === id();

  const registeredOption: RegisteredOption<TType> = {
    disabled,
    element,
    id,
    value,
  };
  onSettled(() => actions.registerOption(registeredOption));

  const focusRing = createFocusRing({ disabled, focusVisibleOnly: true });
  const hover = createHover({ disabled });

  const handleClick = (
    event: MouseEvent & { currentTarget: HTMLElement },
  ): void => {
    if (isDisabledByFieldset(event.currentTarget)) {
      event.preventDefault();
      return;
    }
    if (!actions.change(value())) return;
    element()?.focus();
  };

  const slot: RadioOptionRenderPropArg = {
    get active() {
      return focusRing.focused();
    },
    get autofocus() {
      return autofocus();
    },
    get checked() {
      return checked();
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
  };
  const theirProps = omit(
    props,
    "autofocus",
    "disabled",
    "id",
    "ref",
    "value",
  ) as AnyProps;
  const ourProps = mergeEventProps(
    {
      get ref(): Ref<HTMLElement> {
        return [props.ref as Ref<HTMLElement>, setElement];
      },
      get id() {
        return id();
      },
      role: "radio",
      get "aria-checked"() {
        return checked() ? "true" : "false";
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
      get tabindex() {
        return resolveRadioTabIndex({
          checked: checked(),
          containsCheckedOption: data.containsCheckedOption(),
          disabled: disabled(),
          isFirstOption: isFirstOption(),
          tabIndex: data.tabIndex(),
        });
      },
      get onClick() {
        return disabled() ? undefined : handleClick;
      },
      get autofocus() {
        return autofocus() || undefined;
      },
    },
    focusRing.focusProps,
    hover.hoverProps,
  );

  return (
    <DescriptionProvider name="RadioGroup.Description">
      <LabelProvider name="RadioGroup.Label">
        {renderElement({
          defaultTag: DEFAULT_OPTION_TAG,
          name: "RadioGroup.Option",
          ourProps,
          slot,
          stateKeys: [
            "active",
            "autofocus",
            "checked",
            "disabled",
            "focus",
            "hover",
          ],
          theirProps,
        })}
      </LabelProvider>
    </DescriptionProvider>
  );
}

const DEFAULT_RADIO_TAG = "span" as const;

/**
 * Reactive state exposed to render-prop children of the radio component.
 */
export type RadioRenderPropArg = Readonly<{
  autofocus: boolean;
  checked: boolean;
  disabled: boolean;
  focus: boolean;
  hover: boolean;
}>;

type RadioPropsWeControl =
  | "aria-checked"
  | "aria-describedby"
  | "aria-disabled"
  | "aria-labelledby"
  | "role"
  | "tabIndex"
  | "tabindex";

/**
 * Props accepted by the radio component.
 */
export type RadioProps<
  TTag extends ValidComponent = typeof DEFAULT_RADIO_TAG,
  TType = string,
> = Props<
  TTag,
  RadioRenderPropArg,
  RadioPropsWeControl,
  {
    autofocus?: boolean;
    disabled?: boolean;
    id?: string;
    value: TType;
  },
  HTMLElement
>;

/**
 * Renders the accessible, unstyled radio component for Solid.
 */
export function Radio<
  TTag extends ValidComponent = typeof DEFAULT_RADIO_TAG,
  TType = string,
>(props: RadioProps<TTag, TType>): Element {
  const data = useContext(RadioGroupDataContext) as RadioGroupData<TType>;
  const actions = useContext(
    RadioGroupActionsContext,
  ) as RadioGroupActions<TType>;
  const generatedId = `headlessui-radio-${createUniqueId()}`;
  const providedId = useProvidedId();
  const providedDisabled = useDisabled();
  const labelledBy = useLabelledBy();
  const describedBy = useDescribedBy();
  const [element, setElement] = createSignal<HTMLElement | null>(null);

  const id = () => props.id ?? providedId() ?? generatedId;
  const value = () => props.value;
  const disabled = () =>
    props.disabled ?? (data.disabled() || providedDisabled() || false);
  const autofocus = () => Boolean(props.autofocus);
  const checked = () => data.compare(data.value() as TType, value());
  const isFirstOption = () => data.firstOption()?.id() === id();

  const registeredOption: RegisteredOption<TType> = {
    disabled,
    element,
    id,
    value,
  };
  onSettled(() => actions.registerOption(registeredOption));

  const focusRing = createFocusRing({ disabled, focusVisibleOnly: true });
  const hover = createHover({ disabled });

  const handleClick = (
    event: MouseEvent & { currentTarget: HTMLElement },
  ): void => {
    if (isDisabledByFieldset(event.currentTarget)) {
      event.preventDefault();
      return;
    }
    if (!actions.change(value())) return;
    element()?.focus();
  };

  const slot: RadioRenderPropArg = {
    get autofocus() {
      return autofocus();
    },
    get checked() {
      return checked();
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
  };
  const theirProps = omit(
    props,
    "autofocus",
    "disabled",
    "id",
    "ref",
    "value",
  ) as AnyProps;
  const ourProps = mergeEventProps(
    {
      get ref(): Ref<HTMLElement> {
        return [props.ref as Ref<HTMLElement>, setElement];
      },
      get id() {
        return id();
      },
      role: "radio",
      get "aria-checked"() {
        return checked() ? "true" : "false";
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
      get tabindex() {
        return resolveRadioTabIndex({
          checked: checked(),
          containsCheckedOption: data.containsCheckedOption(),
          disabled: disabled(),
          isFirstOption: isFirstOption(),
          tabIndex: data.tabIndex(),
        });
      },
      get autofocus() {
        return autofocus() || undefined;
      },
      get onClick() {
        return disabled() ? undefined : handleClick;
      },
    },
    focusRing.focusProps,
    hover.hoverProps,
  );

  return renderElement({
    defaultTag: DEFAULT_RADIO_TAG,
    name: "Radio",
    ourProps,
    slot,
    stateKeys: ["autofocus", "checked", "disabled", "focus", "hover"],
    theirProps,
  });
}

/**
 * Renders the label for the radio group component family.
 *
 * @deprecated Use `<Label>` instead of `<RadioGroupLabel>`.
 */
export const RadioGroupLabel = Label;
/**
 * Renders the description for the radio group component family.
 *
 * @deprecated Use `<Description>` instead of `<RadioGroupDescription>`.
 */
export const RadioGroupDescription = Description;

/**
 * Renders the accessible, unstyled radio group component for Solid.
 */
export const RadioGroup: typeof RadioGroupRoot & {
  Description: typeof RadioGroupDescription;
  Label: typeof RadioGroupLabel;
  Option: typeof RadioGroupOption;
  Radio: typeof Radio;
} = Object.assign(RadioGroupRoot, {
  /** @deprecated Use `<Radio>` instead of `<RadioGroup.Option>`. */
  Option: RadioGroupOption,
  /** @deprecated Use `<Radio>` instead of `<RadioGroup.Radio>`. */
  Radio,
  /** @deprecated Use `<Label>` instead of `<RadioGroup.Label>`. */
  Label: RadioGroupLabel,
  /** @deprecated Use `<Description>` instead of `<RadioGroup.Description>`. */
  Description: RadioGroupDescription,
});
