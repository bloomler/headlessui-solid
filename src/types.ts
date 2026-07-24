import type { Element } from "solid-js";
import type { ComponentProps, JSX, ValidComponent } from "@solidjs/web";

/**
 * Element or component type accepted by polymorphic components.
 */
export type ElementType = ValidComponent;

/**
 * Expands an object type so its resolved properties are visible to tooling.
 */
export type Expand<T> = T extends infer Value
  ? { [Key in keyof Value]: Value[Key] }
  : never;

/**
 * Solid-compatible element reference, callback reference, or merged reference list.
 */
export type Ref<T> =
  | T
  | ((element: T) => void)
  | readonly (T | ((element: T) => void) | Ref<T>)[];

/**
 * Props exposed by a polymorphic element or component type.
 */
export type PropsOf<TTag extends ElementType> = ComponentProps<TTag>;

type PropsWeControl = "as" | "children" | "class" | "ref";

type CleanProps<
  TTag extends ElementType,
  TOmittableProps extends PropertyKey = never,
> = Omit<PropsOf<TTag>, TOmittableProps | PropsWeControl>;

type PolymorphicRef<
  TTag extends ElementType,
  TFallbackElement,
> = TTag extends unknown
  ? PropsOf<TTag> extends infer TComponentProps extends object
    ? "ref" extends keyof TComponentProps ? TComponentProps["ref"]
    : Ref<TFallbackElement>
  : Ref<TFallbackElement>
  : never;

type OurProps<TTag extends ElementType, TSlot, TElement> = {
  as?: TTag;
  children?: Element | ((slot: TSlot) => Element);
  class?: JSX.ClassValue | ((slot: TSlot) => JSX.ClassValue);
  ref?: PolymorphicRef<TTag, TElement>;
};

/**
 * Solid-native polymorphic component props.
 *
 * Refs are ordinary props and wrapper-free components do not clone or mutate
 * a single child.
 */
export type Props<
  TTag extends ElementType,
  TSlot = Record<never, never>,
  TOmittableProps extends PropertyKey = never,
  Overrides = Record<never, never>,
  TElement = HTMLElement,
> =
  & CleanProps<TTag, TOmittableProps | keyof Overrides>
  & OurProps<TTag, TSlot, TElement>
  & Overrides;
