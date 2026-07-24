import { type Element, omit } from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import {
  createActivePress,
  createFocusRing,
  createHover,
} from "../../primitives/interactions.ts";
import type { Props, Ref } from "../../types.ts";
import { mergeEventProps, renderElement } from "../../utils/render.tsx";

function MissingDataInteractiveTag(): Element {
  throw new Error(
    "<DataInteractive> requires an `as` prop in Solid because Solid elements cannot be clone-forwarded.",
  );
}

/**
 * Reactive state exposed to render-prop children of the data interactive component.
 */
export type DataInteractiveRenderPropArg = {
  readonly active: boolean;
  readonly focus: boolean;
  readonly hover: boolean;
};

/**
 * Props accepted by the data interactive component.
 */
export type DataInteractiveProps<TTag extends ValidComponent> =
  & Props<
    TTag,
    DataInteractiveRenderPropArg,
    never,
    Record<never, never>,
    HTMLElement
  >
  & { as: TTag };

/**
 * Adds Headless UI interaction state to the element selected by `as`.
 *
 * Solid elements are not cloneable, so the API deliberately requires an
 * explicit polymorphic target instead of introducing a wrapper.
 */
export function DataInteractive<TTag extends ValidComponent>(
  props: DataInteractiveProps<TTag>,
): Element {
  const disabled = () => false;
  const focusRing = createFocusRing({ disabled, focusVisibleOnly: true });
  const hover = createHover({ disabled });
  const activePress = createActivePress({ disabled });

  const slot: DataInteractiveRenderPropArg = {
    get active() {
      return activePress.pressed();
    },
    get focus() {
      return focusRing.focused();
    },
    get hover() {
      return hover.hovered();
    },
  };

  const theirProps = omit(props, "ref");
  const ourProps = mergeEventProps(
    {
      get ref(): Ref<HTMLElement> {
        return props.ref as Ref<HTMLElement>;
      },
    },
    focusRing.focusProps,
    hover.hoverProps,
    activePress.pressProps,
  );

  return renderElement({
    defaultTag: MissingDataInteractiveTag,
    name: "DataInteractive",
    ourProps,
    slot,
    stateKeys: ["hover", "focus", "active"],
    theirProps,
  });
}
