import {
  type Accessor,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  type Element,
  merge,
  omit,
  onSettled,
  untrack,
  useContext,
} from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import { useDisabled } from "../../internal/disabled.tsx";
import { useProvidedId } from "../../internal/id.tsx";
import type { Props } from "../../types.ts";
import {
  isHTMLInputElement,
  isHTMLLabelElement,
  isInteractiveElement,
} from "../../utils/dom.ts";
import type { AnyProps } from "../../utils/merge-event-props.ts";
import { renderElement } from "../../utils/render.tsx";

type MaybeAccessor<T> = T | Accessor<T>;
type SlotData = Record<string, unknown>;

interface SharedData {
  name?: string;
  props?: AnyProps;
  slot?: SlotData;
}

interface LabelContextValue {
  name: Accessor<string | undefined>;
  props: Accessor<AnyProps>;
  register(value: string): () => void;
  slot: Accessor<SlotData>;
  value: Accessor<string | undefined>;
}

export interface LabelProviderProps extends SharedData {
  children?: Element;
  value?: MaybeAccessor<string | undefined>;
}

const EMPTY_DATA: AnyProps = Object.freeze({});
const LabelContext = createContext<LabelContextValue | null>(null);

function read<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as Accessor<T>)() : value;
}

function captureStackTrace(
  error: Error,
  constructor: (...args: never[]) => unknown,
) {
  const errorConstructor = Error as ErrorConstructor & {
    captureStackTrace?: (
      error: Error,
      constructor: (...args: never[]) => unknown,
    ) => void;
  };
  errorConstructor.captureStackTrace?.(error, constructor);
}

export function useLabelContext(): LabelContextValue {
  const context = useContext(LabelContext);
  if (context === null) {
    const error = new Error(
      "You used a <Label /> component, but it is not inside a relevant parent.",
    );
    captureStackTrace(error, useLabelContext);
    throw error;
  }
  return context;
}

export function useLabelledBy(
  alwaysAvailableIds?: readonly (MaybeAccessor<string | null | undefined>)[],
): Accessor<string | undefined> {
  const context = useContext(LabelContext);

  return () => {
    const ids = [
      context?.value(),
      ...(alwaysAvailableIds ?? []).map((value) => read(value)),
    ].filter((value): value is string => Boolean(value));
    return ids.length > 0 ? ids.join(" ") : undefined;
  };
}

function createLabelRegistry(parent: Accessor<string | undefined>) {
  const ids: string[] = [];
  const [version, setVersion] = createSignal(0, { ownedWrite: true });

  const value = () => {
    version();
    const parentId = parent();
    const allIds = parentId ? [parentId, ...ids] : ids;
    return allIds.length > 0 ? allIds.join(" ") : undefined;
  };

  const register = (id: string) => {
    ids.push(id);
    setVersion((current) => current + 1);

    return () => {
      const index = ids.indexOf(id);
      if (index === -1) return;
      ids.splice(index, 1);
      setVersion((current) => current + 1);
    };
  };

  return { register, value };
}

export function useLabels(options: { inherit?: boolean } = {}): readonly [
  Accessor<string | undefined>,
  (props: LabelProviderProps) => Element,
] {
  const parentLabelledBy = useLabelledBy();
  const registry = createLabelRegistry(
    options.inherit === true ? parentLabelledBy : () => undefined,
  );

  function LabelProvider(props: LabelProviderProps): Element {
    const context: LabelContextValue = {
      name: () => props.name,
      props: () => props.props ?? EMPTY_DATA,
      register: registry.register,
      slot: () => props.slot ?? EMPTY_DATA,
      value: () => props.value === undefined ? undefined : read(props.value),
    };

    return <LabelContext value={context}>{props.children}</LabelContext>;
  }

  return [registry.value, LabelProvider] as const;
}

function registerReactiveId(
  context: LabelContextValue,
  id: Accessor<string>,
): void {
  let unregister = untrack(() => context.register(id()));

  createEffect(
    id,
    (nextId) => {
      unregister();
      unregister = context.register(nextId);
    },
    { defer: true },
  );

  onSettled(() => () => unregister());
}

const DEFAULT_LABEL_TAG = "label" as const;

export type LabelRenderPropArg = Readonly<{
  disabled: boolean;
}>;

/**
 * Props accepted by the label component.
 */
export type LabelProps<
  TTag extends ValidComponent = typeof DEFAULT_LABEL_TAG,
> = Props<
  TTag,
  LabelRenderPropArg,
  never,
  {
    for?: string;
    passive?: boolean;
  },
  HTMLElement
>;

/**
 * Renders the accessible, unstyled label component for Solid.
 */
export function Label<
  TTag extends ValidComponent = typeof DEFAULT_LABEL_TAG,
>(props: LabelProps<TTag>): Element {
  const generatedId = `headlessui-label-${createUniqueId()}`;
  const context = useLabelContext();
  const providedId = useProvidedId();
  const providedDisabled = useDisabled();
  const id = createMemo(() => props.id ?? generatedId);
  const forId = createMemo(() => {
    const contextFor = context.props().for;
    return props.for ?? providedId() ??
      (typeof contextFor === "string" ? contextFor : undefined);
  });
  const passive = () => Boolean(props.passive);

  registerReactiveId(context, id);

  const slot = merge(
    () => context.slot(),
    {
      get disabled() {
        return Boolean(providedDisabled());
      },
    },
  ) as LabelRenderPropArg;

  const theirProps = merge(
    omit(props as AnyProps, "for", "id", "onClick", "passive"),
    {
      get as() {
        return props.as ?? (forId() ? DEFAULT_LABEL_TAG : "div");
      },
      get onClick() {
        return passive() ? undefined : props.onClick;
      },
    },
  ) as AnyProps;

  const handleClick = (event: MouseEvent) => {
    const current = event.currentTarget;

    if (
      event.target !== current && isInteractiveElement(event.target)
    ) return;

    if (isHTMLLabelElement(current)) event.preventDefault();

    const contextOnClick = context.props().onClick;
    if (typeof contextOnClick === "function") {
      Reflect.apply(contextOnClick, undefined, [event]);
    }

    if (!isHTMLLabelElement(current)) return;

    const target = current.ownerDocument.getElementById(current.htmlFor);
    if (!target) return;

    const disabled = target.getAttribute("disabled");
    if (disabled === "true" || disabled === "") return;

    const ariaDisabled = target.getAttribute("aria-disabled");
    if (ariaDisabled === "true" || ariaDisabled === "") return;

    if (
      (isHTMLInputElement(target) &&
        ["checkbox", "file", "radio"].includes(target.type)) ||
      ["checkbox", "radio", "switch"].includes(target.role ?? "")
    ) {
      target.click();
    }

    target.focus({ preventScroll: true });
  };

  const ourProps = merge(
    () => context.props(),
    {
      get ref() {
        return props.ref;
      },
      get id() {
        return id();
      },
      get for() {
        return passive() ? undefined : forId();
      },
      get onClick() {
        return passive() ? undefined : handleClick;
      },
    },
  ) as AnyProps;

  return renderElement({
    defaultTag: DEFAULT_LABEL_TAG,
    name: untrack(() => context.name()) ?? "Label",
    ourProps,
    slot,
    stateKeys: ["disabled"],
    theirProps,
  });
}
