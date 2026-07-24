import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  type Element,
  merge,
  omit,
  onSettled,
  untrack,
  useContext,
} from "solid-js";
import type { JSX, ValidComponent } from "@solidjs/web";
import {
  OpenClosedProvider,
  OpenClosedState,
  useOpenClosed,
} from "../../internal/transition-open-closed.tsx";
import {
  createTransitionNesting,
  createTransitionRegistration,
  type TransitionDirection,
  type TransitionNesting,
  TransitionTreeState,
} from "../../internal/transition-nesting.ts";
import {
  createTransition,
  resolveTransitionClasses,
  type TransitionClasses,
} from "../../primitives/transition.ts";
import type { Props, Ref } from "../../types.ts";
import {
  type PropsForFeatures,
  renderElement,
  RenderFeatures,
} from "../../utils/render.tsx";

export type { TransitionClasses } from "../../primitives/transition.ts";

const DEFAULT_TRANSITION_TAG = "div" as const;
const TRANSITION_RENDER_FEATURES = RenderFeatures.RenderStrategy;

export const TRANSITION_REF_ERROR =
  'Solid Transition cannot forward a ref or transition classes through a transparent `as` component. Render a concrete element (`as="div"`, for example), or use `transition={false}` when the component is only a boundary. Solid does not clone a single child.';

/**
 * Lifecycle callbacks emitted before and after transition phases.
 */
export interface TransitionEvents {
  afterEnter?: () => void;
  afterLeave?: () => void;
  beforeEnter?: () => void;
  beforeLeave?: () => void;
}

/**
 * Reactive state exposed to render-prop children of the transition child component.
 */
export type TransitionChildRenderPropArg = Readonly<{
  element: HTMLElement | null;
}>;

type TransitionContextValue = {
  appear: Accessor<boolean>;
  initial: Accessor<boolean>;
  show: Accessor<boolean>;
};

const TransitionContext = createContext<TransitionContextValue | null>(null);
const NestingContext = createContext<TransitionNesting>();

function useTransitionContext(): TransitionContextValue {
  const context = useContext(TransitionContext);
  if (context === null) {
    throw new Error(
      "A <TransitionChild /> is used but it is missing a parent <Transition /> or <TransitionRoot />.",
    );
  }
  return context;
}

type TransitionOverrides =
  & PropsForFeatures<typeof TRANSITION_RENDER_FEATURES>
  & TransitionClasses
  & TransitionEvents
  & {
    appear?: boolean;
    transition?: boolean;
  };

/**
 * Props accepted by the transition child component.
 */
export type TransitionChildProps<
  TTag extends ValidComponent = typeof DEFAULT_TRANSITION_TAG,
> = Props<
  TTag,
  TransitionChildRenderPropArg,
  never,
  TransitionOverrides,
  HTMLElement
>;

/**
 * Props accepted by the transition root component.
 */
export type TransitionRootProps<
  TTag extends ValidComponent = typeof DEFAULT_TRANSITION_TAG,
> = TransitionChildProps<TTag> & {
  appear?: boolean;
  show?: boolean;
};

function classesFrom(props: TransitionClasses): TransitionClasses {
  return {
    get enter() {
      return props.enter;
    },
    get enterFrom() {
      return props.enterFrom;
    },
    get enterTo() {
      return props.enterTo;
    },
    get entered() {
      return props.entered;
    },
    get leave() {
      return props.leave;
    },
    get leaveFrom() {
      return props.leaveFrom;
    },
    get leaveTo() {
      return props.leaveTo;
    },
  };
}

function InternalTransitionChild<
  TTag extends ValidComponent = typeof DEFAULT_TRANSITION_TAG,
>(props: TransitionChildProps<TTag>): Element {
  const context = useTransitionContext();
  const parentNesting = useContext(NestingContext);
  const show = context.show;
  const appear = context.appear;
  const initial = context.initial;
  const [element, setElement] = createSignal<HTMLElement | null>(null);
  const initialTreeState = untrack(show)
    ? TransitionTreeState.Visible
    : TransitionTreeState.Hidden;
  const [treeState, setTreeState] = createSignal(initialTreeState);
  const [ready, setReady] = createSignal(false);
  const registration = createTransitionRegistration(element, initialTreeState);
  const unregister = untrack(() => parentNesting.register(registration));
  const transitionEnabled = () => props.transition !== false;
  const strategyUnmounts = () => props.unmount !== false;
  let transitioning = false;
  let generation = 0;
  let parentToken: symbol | null = null;
  let disposed = false;

  const hide = () => {
    if (disposed) return;
    if (treeState() === TransitionTreeState.Hidden) return;
    registration.state = TransitionTreeState.Hidden;
    parentNesting.markHidden(registration);
    if (strategyUnmounts()) setElement(null);
    setTreeState(TransitionTreeState.Hidden);
  };

  const nesting = createTransitionNesting(() => {
    if (!disposed && !transitioning && !show()) hide();
  });

  const start = (nextShow: boolean) => {
    generation += 1;
    transitioning = true;
    const direction: TransitionDirection = nextShow ? "enter" : "leave";
    parentToken = parentNesting.start(registration, direction);

    if (direction === "enter") props.beforeEnter?.();
    else props.beforeLeave?.();
  };

  const complete = async (nextShow: boolean, currentGeneration: number) => {
    const direction: TransitionDirection = nextShow ? "enter" : "leave";
    await nesting.waitForChildren(direction);
    if (disposed || currentGeneration !== generation) return;

    transitioning = false;
    if (parentToken) parentNesting.settle(registration, parentToken);
    parentToken = null;

    if (direction === "enter") props.afterEnter?.();
    else props.afterLeave?.();

    if (direction === "leave" && !nesting.hasVisibleChildren()) hide();
  };

  const end = (nextShow: boolean) => {
    const currentGeneration = generation;
    void complete(nextShow, currentGeneration);
  };

  createEffect(show, (nextShow) => {
    if (!nextShow) return;
    registration.state = TransitionTreeState.Visible;
    parentNesting.markVisible(registration);
    setTreeState(TransitionTreeState.Visible);
  });

  createEffect(
    () => ({
      show: show(),
      transition: transitionEnabled(),
    }),
    (snapshot) => {
      if (snapshot.transition) return;

      let active = true;
      queueMicrotask(() => {
        if (!active) return;
        start(snapshot.show);
        end(snapshot.show);
      });
      return () => {
        active = false;
      };
    },
  );

  createEffect(
    () => ({
      state: treeState(),
      unmount: strategyUnmounts(),
    }),
    (snapshot) => {
      if (snapshot.state === TransitionTreeState.Hidden && snapshot.unmount) {
        setElement(null);
      }
    },
  );

  const skip = () => initial() && !appear();
  const transition = createTransition({
    element,
    enabled: () =>
      transitionEnabled() && ready() && !skip() && element() !== null,
    show,
    start,
    end,
  });

  onSettled(() => {
    if (
      transitionEnabled() &&
      treeState() === TransitionTreeState.Visible &&
      element() === null
    ) {
      unregister();
      throw new Error(TRANSITION_REF_ERROR);
    }
    setReady(true);

    return () => {
      disposed = true;
      generation += 1;
      unregister();
      if (parentToken) parentNesting.settle(registration, parentToken);
    };
  });

  const slot: TransitionChildRenderPropArg = {
    get element() {
      return element();
    },
  };
  const immediate = () => appear() && show() && initial();
  const phaseClasses = () =>
    resolveTransitionClasses({
      classes: classesFrom(props),
      data: transition.data,
      immediate: immediate(),
      show: show(),
    });
  const consumerClass = (): JSX.ClassValue => {
    const value = props.class;
    return typeof value === "function" ? value(slot) : value;
  };
  const theirProps = omit(
    props,
    "afterEnter",
    "afterLeave",
    "appear",
    "beforeEnter",
    "beforeLeave",
    "class",
    "enter",
    "entered",
    "enterFrom",
    "enterTo",
    "leave",
    "leaveFrom",
    "leaveTo",
    "ref",
    "transition",
  );
  const ourProps = {
    get ref(): Ref<HTMLElement> {
      return [props.ref as Ref<HTMLElement>, setElement];
    },
    get class(): JSX.ClassValue {
      const consumer = consumerClass();
      const phase = phaseClasses();
      return phase ? [consumer, phase] : consumer;
    },
    get "data-closed"() {
      return transition.data.closed ? "" : undefined;
    },
    get "data-enter"() {
      return transition.data.enter ? "" : undefined;
    },
    get "data-leave"() {
      return transition.data.leave ? "" : undefined;
    },
    get "data-transition"() {
      return transition.data.transition ? "" : undefined;
    },
  };

  const openClosedState = () => {
    let state = treeState() === TransitionTreeState.Visible
      ? OpenClosedState.Open
      : OpenClosedState.Closed;
    if (show() && treeState() === TransitionTreeState.Hidden) {
      state |= OpenClosedState.Opening;
    }
    if (!show() && treeState() === TransitionTreeState.Visible) {
      state |= OpenClosedState.Closing;
    }
    return state;
  };

  return (
    <NestingContext value={nesting}>
      <OpenClosedProvider value={openClosedState}>
        {renderElement({
          defaultTag: DEFAULT_TRANSITION_TAG,
          features: TRANSITION_RENDER_FEATURES,
          name: "Transition.Child",
          ourProps,
          slot,
          theirProps,
          visible: () => treeState() === TransitionTreeState.Visible,
        })}
      </OpenClosedProvider>
    </NestingContext>
  );
}

export function TransitionRoot<
  TTag extends ValidComponent = typeof DEFAULT_TRANSITION_TAG,
>(props: TransitionRootProps<TTag>): Element {
  const inherited = useOpenClosed();
  const show = () =>
    props.show ??
      (inherited
        ? (inherited() & OpenClosedState.Open) === OpenClosedState.Open
        : undefined);
  const initialShow = untrack(show);

  if (initialShow === undefined) {
    throw new Error(
      "A <Transition /> is used but it is missing a `show={true | false}` prop.",
    );
  }

  const [initial, setInitial] = createSignal(true);
  const context: TransitionContextValue = {
    appear: () => Boolean(props.appear),
    initial,
    show: () => Boolean(show()),
  };
  const rootNesting = createTransitionNesting();

  createEffect(
    () => ({ initial: initial(), show: Boolean(show()) }),
    (snapshot, previousSnapshot) => {
      if (
        previousSnapshot !== undefined &&
        snapshot.show !== previousSnapshot.show &&
        snapshot.initial
      ) {
        setInitial(false);
      }
    },
  );

  const childProps = omit(
    props,
    "appear",
    "beforeEnter",
    "beforeLeave",
    "ref",
    "show",
  );
  const internalProps = merge(childProps, {
    get ref() {
      return props.ref;
    },
    beforeEnter() {
      if (initial()) setInitial(false);
      props.beforeEnter?.();
    },
    beforeLeave() {
      if (initial()) setInitial(false);
      props.beforeLeave?.();
    },
  }) as unknown as TransitionChildProps<TTag>;

  return (
    <NestingContext value={rootNesting}>
      <TransitionContext value={context}>
        <InternalTransitionChild<TTag> {...internalProps} />
      </TransitionContext>
    </NestingContext>
  );
}

/**
 * Renders the child for the transition component family.
 */
export function TransitionChild<
  TTag extends ValidComponent = typeof DEFAULT_TRANSITION_TAG,
>(props: TransitionChildProps<TTag>): Element {
  const hasTransitionContext = useContext(TransitionContext) !== null;
  const hasOpenClosedContext = useOpenClosed() !== null;

  return !hasTransitionContext && hasOpenClosedContext
    ? <TransitionRoot {...props} />
    : <InternalTransitionChild {...props} />;
}

/**
 * Renders the accessible, unstyled transition component for Solid.
 */
export const Transition: typeof TransitionRoot & {
  Child: typeof TransitionChild;
  Root: typeof TransitionRoot;
} = Object.assign(TransitionRoot, {
  /** @deprecated Use `<TransitionChild>` instead. */
  Child: TransitionChild,
  /** @deprecated Use `<Transition>` instead. */
  Root: TransitionRoot,
});
