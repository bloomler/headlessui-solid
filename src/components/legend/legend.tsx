import type { Element } from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import type { Props } from "../../types.ts";
import {
  Label,
  type LabelProps,
  type LabelRenderPropArg,
} from "../label/label.tsx";

const DEFAULT_LEGEND_TAG = "div" as const;

/**
 * Props accepted by the legend component.
 */
export type LegendProps<
  TTag extends ValidComponent = typeof DEFAULT_LEGEND_TAG,
> = Props<TTag, LabelRenderPropArg, never, Record<never, never>, HTMLElement>;

/**
 * Renders the accessible, unstyled legend component for Solid.
 */
export function Legend<
  TTag extends ValidComponent = typeof DEFAULT_LEGEND_TAG,
>(props: LegendProps<TTag>): Element {
  return (
    <Label<TTag>
      {...(props as LabelProps<TTag>)}
      as={(props.as ?? DEFAULT_LEGEND_TAG) as TTag}
    />
  );
}
