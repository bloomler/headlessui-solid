import { createSignal, type Element, omit } from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import { DisabledProvider, useDisabled } from "../../internal/disabled.tsx";
import type { Props, Ref } from "../../types.ts";
import type { AnyProps } from "../../utils/merge-event-props.ts";
import { renderElement } from "../../utils/render.tsx";
import { useLabels } from "../label/label.tsx";

const DEFAULT_FIELDSET_TAG = "fieldset" as const;

/**
 * Reactive state exposed to render-prop children of the fieldset component.
 */
export type FieldsetRenderPropArg = Readonly<{
  disabled: boolean;
}>;

type FieldsetPropsWeControl = "aria-disabled" | "aria-labelledby" | "role";

/**
 * Props accepted by the fieldset component.
 */
export type FieldsetProps<
  TTag extends ValidComponent = typeof DEFAULT_FIELDSET_TAG,
> = Props<
  TTag,
  FieldsetRenderPropArg,
  FieldsetPropsWeControl,
  { disabled?: boolean },
  HTMLElement
>;

/**
 * Renders the accessible, unstyled fieldset component for Solid.
 */
export function Fieldset<
  TTag extends ValidComponent = typeof DEFAULT_FIELDSET_TAG,
>(props: FieldsetProps<TTag>): Element {
  const [element, setElement] = createSignal<HTMLElement | null>(null);
  const [labelledBy, LabelProvider] = useLabels();
  const providedDisabled = useDisabled();
  const disabled = () => props.disabled ?? providedDisabled() ?? false;
  const isNativeFieldset = () => {
    const resolved = element();
    if (resolved) return resolved.tagName.toLowerCase() === "fieldset";

    const requested = props.as ?? DEFAULT_FIELDSET_TAG;
    return typeof requested === "string" &&
      requested.toLowerCase() === "fieldset";
  };

  const slot: FieldsetRenderPropArg = {
    get disabled() {
      return disabled();
    },
  };

  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return [props.ref as Ref<HTMLElement>, setElement];
    },
    get role() {
      return isNativeFieldset() ? undefined : "group";
    },
    get "aria-labelledby"() {
      return labelledBy();
    },
    get "aria-disabled"() {
      return !isNativeFieldset() && disabled() ? "true" : undefined;
    },
    get disabled() {
      return isNativeFieldset() && disabled() ? true : undefined;
    },
  };

  return (
    <DisabledProvider value={disabled}>
      <LabelProvider slot={slot}>
        {renderElement({
          defaultTag: DEFAULT_FIELDSET_TAG,
          name: "Fieldset",
          ourProps,
          slot,
          stateKeys: ["disabled"],
          theirProps: omit(props, "disabled") as AnyProps,
        })}
      </LabelProvider>
    </DisabledProvider>
  );
}
