import { createUniqueId, type Element, omit } from "solid-js";
import type { JSX, ValidComponent } from "@solidjs/web";
import { useDisabled } from "../../internal/disabled.tsx";
import { useProvidedId } from "../../internal/id.tsx";
import { createFocusRing, createHover } from "../../primitives/interactions.ts";
import type { Props, Ref } from "../../types.ts";
import { mergeEventProps, renderElement } from "../../utils/render.tsx";
import { useDescribedBy } from "../description/description.tsx";
import { useLabelledBy } from "../label/label.tsx";

const DEFAULT_TEXTAREA_TAG = "textarea" as const;

/**
 * Reactive state exposed to render-prop children of the textarea component.
 */
export type TextareaRenderPropArg = {
  readonly autofocus: boolean;
  readonly disabled: boolean;
  readonly focus: boolean;
  readonly hover: boolean;
  readonly invalid: boolean;
};

/**
 * Props accepted by the textarea component.
 */
export type TextareaProps<
  TTag extends ValidComponent = typeof DEFAULT_TEXTAREA_TAG,
> = Props<
  TTag,
  TextareaRenderPropArg,
  never,
  {
    "aria-invalid"?: JSX.AriaAttributes["aria-invalid"];
    autofocus?: boolean;
    disabled?: boolean;
    id?: string;
    invalid?: boolean;
  },
  HTMLElement
>;

/**
 * Renders the accessible, unstyled textarea component for Solid.
 */
export function Textarea<
  TTag extends ValidComponent = typeof DEFAULT_TEXTAREA_TAG,
>(props: TextareaProps<TTag>): Element {
  const generatedId = `headlessui-textarea-${createUniqueId()}`;
  const providedDisabled = useDisabled();
  const providedId = useProvidedId();
  const labelledBy = useLabelledBy();
  const describedBy = useDescribedBy();
  const autofocus = () => Boolean(props.autofocus);
  const disabled = () => props.disabled ?? providedDisabled() ?? false;
  const id = () => props.id ?? providedId() ?? generatedId;
  const invalid = () => Boolean(props.invalid);

  const focusRing = createFocusRing({ disabled, focusVisibleOnly: false });
  const hover = createHover({ disabled });

  const slot: TextareaRenderPropArg = {
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
    get invalid() {
      return invalid();
    },
  };

  const theirProps = omit(
    props,
    "autofocus",
    "disabled",
    "id",
    "invalid",
    "ref",
  );
  const ourProps = mergeEventProps(
    {
      get ref(): Ref<HTMLElement> {
        return props.ref as Ref<HTMLElement>;
      },
      get id() {
        return id();
      },
      get "aria-labelledby"() {
        return props["aria-labelledby"] ?? labelledBy();
      },
      get "aria-describedby"() {
        return props["aria-describedby"] ?? describedBy();
      },
      get "aria-invalid"() {
        return invalid() ? "true" : props["aria-invalid"];
      },
      get disabled() {
        return disabled() || undefined;
      },
      get autofocus() {
        return autofocus() || undefined;
      },
    },
    focusRing.focusProps,
    hover.hoverProps,
  );

  return renderElement({
    defaultTag: DEFAULT_TEXTAREA_TAG,
    name: "Textarea",
    ourProps,
    slot,
    stateKeys: ["disabled", "invalid", "hover", "focus", "autofocus"],
    theirProps,
  });
}
