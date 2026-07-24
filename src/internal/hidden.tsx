import { type Element, omit } from "solid-js";
import type { JSX, ValidComponent } from "@solidjs/web";
import type { Props, Ref } from "../types.ts";
import type { AnyProps } from "../utils/merge-event-props.ts";
import { renderElement } from "../utils/render.tsx";

const DEFAULT_VISUALLY_HIDDEN_TAG = "span" as const;

export enum HiddenFeatures {
  None = 1 << 0,
  Focusable = 1 << 1,
  Hidden = 1 << 2,
}

type HiddenRenderPropArg = Record<never, never>;

export type HiddenProps<
  TTag extends ValidComponent = typeof DEFAULT_VISUALLY_HIDDEN_TAG,
> = Props<
  TTag,
  HiddenRenderPropArg,
  never,
  { features?: HiddenFeatures },
  HTMLElement
>;

const visuallyHiddenStyle: JSX.CSSProperties = {
  position: "fixed",
  top: "1px",
  left: "1px",
  width: "1px",
  height: "0",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  "white-space": "nowrap",
  "border-width": "0",
};

function resolvedStyle(
  style: JSX.CSSProperties | string | undefined,
  completelyHidden: boolean,
  focusable: boolean,
): JSX.CSSProperties | string {
  const hiddenStyle = completelyHidden && !focusable
    ? { ...visuallyHiddenStyle, display: "none" }
    : visuallyHiddenStyle;

  if (typeof style === "string") {
    const prefix = Object.entries(hiddenStyle)
      .map(([property, value]) => `${property}:${value}`)
      .join(";");
    return `${prefix};${style}`;
  }

  return { ...hiddenStyle, ...(style ?? {}) };
}

export function Hidden<
  TTag extends ValidComponent = typeof DEFAULT_VISUALLY_HIDDEN_TAG,
>(props: HiddenProps<TTag>): Element {
  const source = props as AnyProps;
  const theirProps = omit(
    source,
    "aria-hidden",
    "features",
    "hidden",
    "ref",
    "style",
  );
  const ourProps = {
    get ref(): Ref<HTMLElement> | undefined {
      return props.ref;
    },
    get "aria-hidden"(): boolean | string | undefined {
      return ((props.features ?? HiddenFeatures.None) &
          HiddenFeatures.Focusable) === HiddenFeatures.Focusable
        ? "true"
        : source["aria-hidden"] as boolean | string | undefined;
    },
    get hidden(): boolean | undefined {
      return ((props.features ?? HiddenFeatures.None) &
          HiddenFeatures.Hidden) === HiddenFeatures.Hidden
        ? true
        : source.hidden as boolean | undefined;
    },
    get style(): JSX.CSSProperties | string {
      const features = props.features ?? HiddenFeatures.None;
      return resolvedStyle(
        source.style as JSX.CSSProperties | string | undefined,
        (features & HiddenFeatures.Hidden) === HiddenFeatures.Hidden,
        (features & HiddenFeatures.Focusable) === HiddenFeatures.Focusable,
      );
    },
  };

  return renderElement({
    defaultTag: DEFAULT_VISUALLY_HIDDEN_TAG,
    name: "Hidden",
    ourProps,
    slot: {},
    theirProps,
  });
}
