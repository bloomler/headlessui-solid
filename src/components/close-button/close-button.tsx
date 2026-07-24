import type { Element } from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import { useClose } from "../../internal/close-provider.tsx";
import type { AnyProps } from "../../utils/merge-event-props.ts";
import { mergeEventProps } from "../../utils/render.tsx";
import { Button, type ButtonProps } from "../button/button.tsx";

const DEFAULT_CLOSE_BUTTON_TAG = "button" as const;

/**
 * Props accepted by the close button component.
 */
export type CloseButtonProps<
  TTag extends ValidComponent = typeof DEFAULT_CLOSE_BUTTON_TAG,
> = ButtonProps<TTag>;

/**
 * Renders the accessible, unstyled close button component for Solid.
 */
export function CloseButton<
  TTag extends ValidComponent = typeof DEFAULT_CLOSE_BUTTON_TAG,
>(props: CloseButtonProps<TTag>): Element {
  const close = useClose();
  const buttonProps = mergeEventProps(
    { onClick: close },
    props as unknown as AnyProps,
  );

  return <Button {...buttonProps} />;
}
