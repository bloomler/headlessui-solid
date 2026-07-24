import {
  type Component,
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  type Element,
  omit,
  onSettled,
  Show,
  useContext,
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
import { isHTMLLabelElement } from "../../utils/dom.ts";
import type { AnyProps } from "../../utils/merge-event-props.ts";
import { mergeEventProps, renderElement } from "../../utils/render.tsx";
import {
  Description,
  useDescribedBy,
  useDescriptions,
} from "../description/description.tsx";
import { Label, useLabelledBy, useLabels } from "../label/label.tsx";

const Transparent: Component<{ children?: Element }> = (props) => (
  <>{props.children}</>
);

interface SwitchGroupContextValue {
  defaultId: string;
  element: () => HTMLElement | null;
  setElement: (element: HTMLElement | null) => void;
}

const SwitchGroupContext = createContext<SwitchGroupContextValue | null>(null);

/**
 * Props accepted by the switch group component.
 */
export type SwitchGroupProps<
  TTag extends ValidComponent = typeof Transparent,
> = Props<TTag, Record<never, never>, never, Record<never, never>, HTMLElement>;

/**
 * Renders the group for the switch component family.
 */
export function SwitchGroup<
  TTag extends ValidComponent = typeof Transparent,
>(props: SwitchGroupProps<TTag>): Element {
  // A switch ref does not exist during SSR. Share a deterministic fallback
  // with Label so its element type and `for` target survive hydration.
  const defaultId = `headlessui-switch-${createUniqueId()}`;
  const [element, setElement] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });
  const [labelledBy, LabelProvider] = useLabels();
  const [describedBy, DescriptionProvider] = useDescriptions();
  const context: SwitchGroupContextValue = { defaultId, element, setElement };
  const labelProps: AnyProps = {
    get for() {
      return element()?.id ?? defaultId;
    },
    onClick(event: MouseEvent) {
      // Native labels are handled by Label itself through `for`. Custom label
      // tags have no native association, so preserve Switch.Group's imperative
      // click/focus behavior without toggling native labels twice.
      if (isHTMLLabelElement(event.currentTarget)) return;

      const target = element();
      if (!target) return;
      target.click();
      target.focus({ preventScroll: true });
    },
  };
  const theirProps = omit(props, "ref");
  const ourProps = {
    get ref(): Ref<HTMLElement> {
      return props.ref as Ref<HTMLElement>;
    },
  };

  return (
    <DescriptionProvider name="Switch.Description" value={describedBy}>
      <LabelProvider
        name="Switch.Label"
        props={labelProps}
        value={labelledBy}
      >
        <SwitchGroupContext value={context}>
          {renderElement({
            defaultTag: Transparent,
            name: "Switch.Group",
            ourProps,
            slot: {},
            theirProps,
          })}
        </SwitchGroupContext>
      </LabelProvider>
    </DescriptionProvider>
  );
}

const DEFAULT_SWITCH_TAG = "button" as const;

/**
 * Reactive state exposed to render-prop children of the switch component.
 */
export type SwitchRenderPropArg = Readonly<{
  active: boolean;
  autofocus: boolean;
  changing: boolean;
  checked: boolean;
  disabled: boolean;
  focus: boolean;
  hover: boolean;
}>;

type SwitchPropsWeControl =
  | "aria-checked"
  | "aria-describedby"
  | "aria-labelledby"
  | "role";

/**
 * Props accepted by the switch component.
 */
export type SwitchProps<
  TTag extends ValidComponent = typeof DEFAULT_SWITCH_TAG,
> = Props<
  TTag,
  SwitchRenderPropArg,
  SwitchPropsWeControl,
  {
    autofocus?: boolean;
    checked?: boolean;
    defaultChecked?: boolean;
    disabled?: boolean;
    form?: string;
    name?: string;
    onChange?: (checked: boolean) => void;
    tabindex?: number;
    type?: "button" | "reset" | "submit";
    value?: string;
  },
  HTMLElement
>;

function SwitchRoot<
  TTag extends ValidComponent = typeof DEFAULT_SWITCH_TAG,
>(props: SwitchProps<TTag>): Element {
  const generatedId = `headlessui-switch-${createUniqueId()}`;
  const providedId = useProvidedId();
  const providedDisabled = useDisabled();
  const group = useContext(SwitchGroupContext);
  const labelledBy = useLabelledBy();
  const describedBy = useDescribedBy();
  const disabled = () => props.disabled ?? providedDisabled() ?? false;
  const autofocus = () => Boolean(props.autofocus);
  const control = createBooleanControl({
    checked: () => props.checked,
    defaultChecked: () => props.defaultChecked,
    onChange: () => props.onChange,
  });
  const [element, setElement] = createSignal<HTMLElement | null>(null);
  const [changing, setChanging] = createSignal(false);
  const scheduled = disposables();
  let registeredElement: HTMLElement | null = null;

  const registerGroupElement = (current: HTMLElement | null) => {
    const previous = registeredElement;
    registeredElement = current;

    if (!group) return;
    if (current) group.setElement(current);
    else if (group.element() === previous) group.setElement(null);
  };

  createEffect(
    element,
    registerGroupElement,
    { defer: true },
  );

  onSettled(() => {
    registerGroupElement(element());

    return () => {
      scheduled.dispose();
      if (group?.element() === registeredElement) group.setElement(null);
    };
  });

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

  const slot: SwitchRenderPropArg = {
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
  };

  const theirProps = omit(
    props,
    "autofocus",
    "checked",
    "defaultChecked",
    "disabled",
    "form",
    "name",
    "onChange",
    "ref",
    "tabindex",
    "type",
    "value",
  );
  const ourProps = mergeEventProps(
    {
      get ref(): Ref<HTMLElement> {
        return [props.ref as Ref<HTMLElement>, setElement];
      },
      get id() {
        return props.id ?? providedId() ?? group?.defaultId ?? generatedId;
      },
      role: "switch",
      get type() {
        if (props.type) return props.type;

        const tag = props.as ?? DEFAULT_SWITCH_TAG;
        if (typeof tag === "string" && tag.toLowerCase() === "button") {
          return "button";
        }

        const resolved = element();
        return resolved?.tagName === "BUTTON" &&
            !resolved.hasAttribute("type")
          ? "button"
          : undefined;
      },
      get tabindex() {
        return props.tabindex === -1 ? 0 : props.tabindex ?? 0;
      },
      get "aria-checked"() {
        return control.checked() ? "true" : "false";
      },
      get "aria-labelledby"() {
        return labelledBy();
      },
      get "aria-describedby"() {
        return describedBy();
      },
      get disabled() {
        return disabled() || undefined;
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
        defaultTag: DEFAULT_SWITCH_TAG,
        name: "Switch",
        ourProps,
        slot,
        stateKeys: [
          "checked",
          "disabled",
          "hover",
          "focus",
          "active",
          "autofocus",
          "changing",
        ],
        theirProps,
      })}
    </>
  );
}

/**
 * Renders the label for the switch component family.
 *
 * @deprecated Use `<Label>` instead.
 */
export const SwitchLabel = Label;
/**
 * Renders the description for the switch component family.
 *
 * @deprecated Use `<Description>` instead.
 */
export const SwitchDescription = Description;

/**
 * Renders the accessible, unstyled switch component for Solid.
 */
export const Switch: typeof SwitchRoot & {
  Description: typeof SwitchDescription;
  Group: typeof SwitchGroup;
  Label: typeof SwitchLabel;
} = Object.assign(SwitchRoot, {
  /** @deprecated Use `<Field>` instead. */
  Group: SwitchGroup,
  /** @deprecated Use `<Label>` instead. */
  Label: SwitchLabel,
  /** @deprecated Use `<Description>` instead. */
  Description: SwitchDescription,
});
