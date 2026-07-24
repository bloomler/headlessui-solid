import { createSignal, type Element, omit } from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import {
  createActivePress,
  createFocusRing,
  createHover,
} from "../../primitives/interactions.ts";
import type { Props, Ref } from "../../types.ts";
import { mergeEventProps, renderElement } from "../../utils/render.tsx";

const DEFAULT_BUTTON_TAG = "button" as const;

/**
 * Reactive state exposed to render-prop children of the button component.
 */
export type ButtonRenderPropArg = {
  readonly active: boolean;
  readonly autofocus: boolean;
  readonly disabled: boolean;
  readonly focus: boolean;
  readonly hover: boolean;
};

/**
 * Props accepted by the button component.
 */
export type ButtonProps<
  TTag extends ValidComponent = typeof DEFAULT_BUTTON_TAG,
> = Props<
  TTag,
  ButtonRenderPropArg,
  never,
  {
    autofocus?: boolean;
    disabled?: boolean;
    type?: "button" | "reset" | "submit";
  },
  HTMLElement
>;

/**
 * Renders the accessible, unstyled button component for Solid.
 */
export function Button<
  TTag extends ValidComponent = typeof DEFAULT_BUTTON_TAG,
>(props: ButtonProps<TTag>): Element {
  const [element, setElement] = createSignal<HTMLElement | null>(null);
  const disabled = () => Boolean(props.disabled);
  const autofocus = () => Boolean(props.autofocus);

  const focusRing = createFocusRing({ disabled, focusVisibleOnly: true });
  const hover = createHover({ disabled });
  const activePress = createActivePress({ disabled });

  const slot: ButtonRenderPropArg = {
    get active() {
      return activePress.pressed();
    },
    get autofocus() {
      return autofocus();
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
    "ref",
    "type",
  );
  const ourProps = mergeEventProps(
    {
      get ref(): Ref<HTMLElement> {
        return [props.ref as Ref<HTMLElement>, setElement];
      },
      get type() {
        if (props.type) return props.type;

        const tag = props.as ?? DEFAULT_BUTTON_TAG;
        if (typeof tag === "string" && tag.toLowerCase() === "button") {
          return "button";
        }

        const resolved = element();
        return resolved?.tagName === "BUTTON" && !resolved.hasAttribute("type")
          ? "button"
          : undefined;
      },
      get disabled() {
        return disabled() || undefined;
      },
      get autofocus() {
        return autofocus() || undefined;
      },
      get "data-autofocus"() {
        return autofocus() ? "" : undefined;
      },
    },
    focusRing.focusProps,
    hover.hoverProps,
    activePress.pressProps,
  );

  return renderElement({
    defaultTag: DEFAULT_BUTTON_TAG,
    name: "Button",
    ourProps,
    slot,
    stateKeys: ["active", "autofocus", "disabled", "focus", "hover"],
    theirProps,
  });
}
