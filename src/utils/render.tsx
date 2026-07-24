import {
  type Accessor,
  type Component,
  createMemo,
  type Element,
  omit,
  Show,
  untrack,
} from "solid-js";
import { dynamic, type JSX, type ValidComponent } from "@solidjs/web";
import { type AnyProps, mergeEventProps } from "./merge-event-props.ts";

export { mergeEventProps } from "./merge-event-props.ts";

export enum RenderFeatures {
  None = 0,
  RenderStrategy = 1,
  Static = 2,
}

export enum RenderStrategy {
  Unmount,
  Hidden,
}

export type PropsForFeatures<TFeature extends RenderFeatures> =
  & (TFeature extends RenderFeatures.Static ? { static?: boolean } : object)
  & (TFeature extends RenderFeatures.RenderStrategy ? { unmount?: boolean }
    : object);

function toStateAttribute(key: string): string {
  return key.replace(/([A-Z])/g, (match) => `-${match.toLowerCase()}`);
}

function stateAttributes<TSlot extends object>(
  slot: TSlot,
  stateKeys: readonly (keyof TSlot & string)[],
): AnyProps {
  const attributes: AnyProps = {};

  Object.defineProperty(attributes, "data-headlessui-state", {
    enumerable: true,
    get() {
      return stateKeys.filter((key) => slot[key] === true).map(toStateAttribute)
        .join(" ");
    },
  });

  for (const key of stateKeys) {
    Object.defineProperty(attributes, `data-${toStateAttribute(key)}`, {
      enumerable: true,
      get() {
        return slot[key] === true ? "" : undefined;
      },
    });
  }

  return attributes;
}

function read<T>(value: T | Accessor<T>): T {
  return typeof value === "function" ? (value as Accessor<T>)() : value;
}

export function renderElement<
  TTag extends ValidComponent,
  TSlot extends object,
  TFeature extends RenderFeatures = RenderFeatures.None,
>(options: {
  defaultTag: TTag;
  features?: TFeature;
  name: string;
  ourProps: AnyProps;
  slot: TSlot;
  stateKeys?: readonly (keyof TSlot & string)[];
  theirProps: AnyProps;
  visible?: boolean | Accessor<boolean>;
}): Element {
  const features = options.features ?? RenderFeatures.None;
  const visible = () => read(options.visible ?? true);
  const staticallyRendered = () =>
    Boolean(
      (features & RenderFeatures.Static) &&
        options.theirProps.static === true,
    );

  const shouldRender = createMemo(() => {
    if (visible()) return true;
    if (staticallyRendered()) return true;
    return Boolean(
      (features & RenderFeatures.RenderStrategy) &&
        options.theirProps.unmount === false,
    );
  });

  const hidden = createMemo(() =>
    !visible() && !staticallyRendered() && shouldRender()
  );
  const children = createMemo(() => {
    const child = options.theirProps.children;
    // Solid Elements may themselves be zero-argument reactive accessors.
    // Match Solid's control-flow convention: only a function that declares an
    // argument is a render callback. Keep that callback inside this lazy memo:
    // direct primitive returns depend on slot state here, while reactive JSX
    // expressions establish their own finer-grained subscriptions below it.
    return typeof child === "function" && child.length > 0
      ? (child as (slot: TSlot) => Element)(options.slot)
      : child as Element;
  });

  const renderProps = omit(
    options.theirProps,
    "as",
    "children",
    "class",
    "hidden",
    "ref",
    "static",
    "style",
    "unmount",
  );
  const presentationProps: AnyProps = {};
  // JSX spread composition can represent a statically shaped prop source with
  // a memo-backed `merge()` proxy. Property-presence checks resolve that memo,
  // so make the one-time shape inspection explicitly untracked. Prop values
  // themselves remain lazy through the getters below.
  const hasClass = untrack(() => "class" in options.theirProps);
  const hasHidden = untrack(() => "hidden" in options.theirProps);
  const hasStyle = untrack(() => "style" in options.theirProps);

  if (hasClass) {
    Object.defineProperty(presentationProps, "class", {
      enumerable: true,
      get(): JSX.ClassValue {
        const value = options.theirProps.class;
        return typeof value === "function"
          ? (value as (slot: TSlot) => JSX.ClassValue)(options.slot)
          : value as JSX.ClassValue;
      },
    });
  }

  if (
    hasHidden ||
    (features & RenderFeatures.RenderStrategy) !== 0
  ) {
    Object.defineProperty(presentationProps, "hidden", {
      enumerable: true,
      get(): unknown {
        return hidden() ? true : options.theirProps.hidden;
      },
    });
  }

  if (
    hasStyle ||
    (features & RenderFeatures.RenderStrategy) !== 0
  ) {
    Object.defineProperty(presentationProps, "style", {
      enumerable: true,
      get(): unknown {
        return hidden() ? { display: "none" } : options.theirProps.style;
      },
    });
  }
  const mergedProps = mergeEventProps(
    stateAttributes(options.slot, options.stateKeys ?? []),
    renderProps,
    options.ourProps,
    presentationProps,
  );

  const Resolved = dynamic(
    () => (options.theirProps.as ?? options.defaultTag) as ValidComponent,
  ) as Component<AnyProps>;

  return (
    <Show when={shouldRender()}>
      <Resolved {...mergedProps}>{children()}</Resolved>
    </Show>
  );
}
