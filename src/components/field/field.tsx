import { createUniqueId, type Element, omit } from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import { DisabledProvider, useDisabled } from "../../internal/disabled.tsx";
import { IdProvider } from "../../internal/id.tsx";
import type { Props } from "../../types.ts";
import type { AnyProps } from "../../utils/merge-event-props.ts";
import { renderElement } from "../../utils/render.tsx";
import { useDescriptions } from "../description/description.tsx";
import { useLabels } from "../label/label.tsx";

const DEFAULT_FIELD_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the field component.
 */
export type FieldRenderPropArg = Readonly<{
  disabled: boolean;
}>;

/**
 * Props accepted by the field component.
 */
export type FieldProps<
  TTag extends ValidComponent = typeof DEFAULT_FIELD_TAG,
> = Props<
  TTag,
  FieldRenderPropArg,
  never,
  { disabled?: boolean },
  HTMLElement
>;

/**
 * Renders the accessible, unstyled field component for Solid.
 */
export function Field<
  TTag extends ValidComponent = typeof DEFAULT_FIELD_TAG,
>(props: FieldProps<TTag>): Element {
  const controlId = `headlessui-control-${createUniqueId()}`;
  const [labelledBy, LabelProvider] = useLabels();
  const [describedBy, DescriptionProvider] = useDescriptions();
  const providedDisabled = useDisabled();
  const disabled = () => props.disabled ?? providedDisabled() ?? false;

  const slot: FieldRenderPropArg = {
    get disabled() {
      return disabled();
    },
  };

  const ourProps: AnyProps = {
    get ref() {
      return props.ref;
    },
    get disabled() {
      return disabled() || undefined;
    },
    get "aria-disabled"() {
      return disabled() ? "true" : undefined;
    },
  };

  return (
    <DisabledProvider value={disabled}>
      <LabelProvider value={labelledBy} slot={slot}>
        <DescriptionProvider value={describedBy} slot={slot}>
          <IdProvider id={controlId}>
            {renderElement({
              defaultTag: DEFAULT_FIELD_TAG,
              name: "Field",
              ourProps,
              slot,
              stateKeys: ["disabled"],
              theirProps: omit(props, "disabled") as AnyProps,
            })}
          </IdProvider>
        </DescriptionProvider>
      </LabelProvider>
    </DisabledProvider>
  );
}
