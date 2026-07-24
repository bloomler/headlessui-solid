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
import type { Props } from "../../types.ts";
import type { AnyProps } from "../../utils/merge-event-props.ts";
import { renderElement } from "../../utils/render.tsx";

type MaybeAccessor<T> = T | Accessor<T>;
type SlotData = Record<string, unknown>;

interface SharedData {
  name?: string;
  props?: AnyProps;
  slot?: SlotData;
}

interface DescriptionContextValue {
  name: Accessor<string | undefined>;
  props: Accessor<AnyProps>;
  register(value: string): () => void;
  slot: Accessor<SlotData>;
  value: Accessor<string | undefined>;
}

export interface DescriptionProviderProps extends SharedData {
  children?: Element;
  value?: MaybeAccessor<string | undefined>;
}

const EMPTY_DATA: AnyProps = Object.freeze({});
const DescriptionContext = createContext<DescriptionContextValue | null>(null);

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

function useDescriptionContext(): DescriptionContextValue {
  const context = useContext(DescriptionContext);
  if (context === null) {
    const error = new Error(
      "You used a <Description /> component, but it is not inside a relevant parent.",
    );
    captureStackTrace(error, useDescriptionContext);
    throw error;
  }
  return context;
}

export function useDescribedBy(): Accessor<string | undefined> {
  const context = useContext(DescriptionContext);
  return () => context?.value();
}

function createDescriptionRegistry() {
  const ids: string[] = [];
  const [version, setVersion] = createSignal(0, { ownedWrite: true });

  const value = () => {
    version();
    return ids.length > 0 ? ids.join(" ") : undefined;
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

export function useDescriptions(): readonly [
  Accessor<string | undefined>,
  (props: DescriptionProviderProps) => Element,
] {
  const registry = createDescriptionRegistry();

  function DescriptionProvider(props: DescriptionProviderProps): Element {
    const context: DescriptionContextValue = {
      name: () => props.name,
      props: () => props.props ?? EMPTY_DATA,
      register: registry.register,
      slot: () => props.slot ?? EMPTY_DATA,
      value: () => props.value === undefined ? undefined : read(props.value),
    };

    return (
      <DescriptionContext value={context}>
        {props.children}
      </DescriptionContext>
    );
  }

  return [registry.value, DescriptionProvider] as const;
}

function registerReactiveId(
  context: DescriptionContextValue,
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

const DEFAULT_DESCRIPTION_TAG = "p" as const;

export type DescriptionRenderPropArg = Readonly<{
  disabled: boolean;
}>;

/**
 * Props accepted by the description component.
 */
export type DescriptionProps<
  TTag extends ValidComponent = typeof DEFAULT_DESCRIPTION_TAG,
> = Props<
  TTag,
  DescriptionRenderPropArg,
  never,
  Record<never, never>,
  HTMLElement
>;

/**
 * Renders the accessible, unstyled description component for Solid.
 */
export function Description<
  TTag extends ValidComponent = typeof DEFAULT_DESCRIPTION_TAG,
>(props: DescriptionProps<TTag>): Element {
  const generatedId = `headlessui-description-${createUniqueId()}`;
  const context = useDescriptionContext();
  const providedDisabled = useDisabled();
  const id = createMemo(() => props.id ?? generatedId);

  registerReactiveId(context, id);

  const slot = merge(
    () => context.slot(),
    {
      get disabled() {
        return Boolean(providedDisabled());
      },
    },
  ) as DescriptionRenderPropArg;

  const ourProps = merge(
    () => context.props(),
    {
      get ref() {
        return props.ref;
      },
      get id() {
        return id();
      },
    },
  ) as AnyProps;

  return renderElement({
    defaultTag: DEFAULT_DESCRIPTION_TAG,
    name: untrack(() => context.name()) ?? "Description",
    ourProps,
    slot,
    stateKeys: ["disabled"],
    theirProps: omit(props as AnyProps, "id") as AnyProps,
  });
}
