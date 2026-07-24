import { type Accessor, createEffect, createSignal, flush } from "solid-js";
import { classNames } from "../utils/class-names.ts";
import { disposables } from "../utils/disposables.ts";

/**
 * CSS class names applied during each transition phase.
 */
export interface TransitionClasses {
  enter?: string;
  enterFrom?: string;
  enterTo?: string;
  /** @deprecated `enterTo` and `leaveTo` remain applied after transitions. */
  entered?: string;
  leave?: string;
  leaveFrom?: string;
  leaveTo?: string;
}

export interface TransitionData {
  closed?: boolean;
  enter?: boolean;
  leave?: boolean;
  transition?: boolean;
}

enum TransitionState {
  None = 0,
  Closed = 1 << 0,
  Enter = 1 << 1,
  Leave = 1 << 2,
}

interface TransitionSnapshot {
  element: HTMLElement | null;
  enabled: boolean;
  show: boolean;
}

export function transitionDataAttributes(
  data: TransitionData,
): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const key of Object.keys(data) as (keyof TransitionData)[]) {
    if (data[key] === true) attributes[`data-${key}`] = "";
  }
  return attributes;
}

export function resolveTransitionClasses(options: {
  classes: TransitionClasses;
  data: TransitionData;
  immediate: boolean;
  show: boolean;
}): string | undefined {
  const { classes, data, immediate, show } = options;
  return classNames(
    immediate && classes.enter,
    immediate && classes.enterFrom,
    data.enter && classes.enter,
    data.enter && data.closed && classes.enterFrom,
    data.enter && !data.closed && classes.enterTo,
    data.leave && classes.leave,
    data.leave && !data.closed && classes.leaveFrom,
    data.leave && data.closed && classes.leaveTo,
    !data.transition && show && classes.entered,
  ).trim() || undefined;
}

function transitionData(flags: number): TransitionData {
  return {
    get closed() {
      return (flags & TransitionState.Closed) === TransitionState.Closed;
    },
    get enter() {
      return (flags & TransitionState.Enter) === TransitionState.Enter;
    },
    get leave() {
      return (flags & TransitionState.Leave) === TransitionState.Leave;
    },
    get transition() {
      return (flags & (TransitionState.Enter | TransitionState.Leave)) !== 0;
    },
  };
}

export function createTransition(options: {
  element: Accessor<HTMLElement | null>;
  enabled: Accessor<boolean>;
  end?: (show: boolean) => void;
  show: Accessor<boolean>;
  start?: (show: boolean) => void;
}): { data: TransitionData } {
  const [flags, setFlags] = createSignal(TransitionState.None);
  let inFlight = false;
  let cancelled = false;
  let disposeTransition = () => {};

  const commit = (update: (current: number) => number) => {
    flush(() => setFlags(update));
  };

  createEffect<TransitionSnapshot>(
    (previous) => {
      const snapshot = {
        element: options.element(),
        enabled: options.enabled(),
        show: options.show(),
      };
      return previous?.element === snapshot.element &&
          previous.enabled === snapshot.enabled &&
          previous.show === snapshot.show
        ? previous
        : snapshot;
    },
    (snapshot, previousSnapshot) => {
      if (
        previousSnapshot?.element === snapshot.element &&
        previousSnapshot.enabled === snapshot.enabled &&
        previousSnapshot.show === snapshot.show
      ) {
        return;
      }

      let active = true;

      queueMicrotask(() => {
        if (!active) return;
        disposeTransition();
        disposeTransition = () => {};

        if (!snapshot.enabled || !snapshot.element) {
          inFlight = false;
          cancelled = false;
          commit(() => TransitionState.None);
          return;
        }

        const element = snapshot.element;
        const show = snapshot.show;
        options.start?.(show);

        disposeTransition = runTransition(element, {
          inFlight: () => inFlight,
          prepare() {
            if (cancelled) {
              cancelled = false;
            } else {
              cancelled = inFlight;
            }
            inFlight = true;

            if (cancelled) return;
            commit((current) =>
              show
                ? (current | TransitionState.Enter | TransitionState.Closed) &
                  ~TransitionState.Leave
                : (current | TransitionState.Leave) & ~TransitionState.Enter
            );
          },
          run() {
            commit((current) => {
              if (cancelled) {
                return show
                  ? (current &
                    ~(TransitionState.Enter | TransitionState.Closed)) |
                    TransitionState.Leave
                  : (current & ~TransitionState.Leave) |
                    TransitionState.Enter |
                    TransitionState.Closed;
              }

              return show
                ? current & ~TransitionState.Closed
                : current | TransitionState.Closed;
            });
          },
          done() {
            if (cancelled && hasPendingTransitions(element)) return;

            inFlight = false;
            commit(() => TransitionState.None);
            options.end?.(show);
          },
        });
      });

      return () => {
        active = false;
        disposeTransition();
        disposeTransition = () => {};
      };
    },
  );

  const data: TransitionData = {
    get closed() {
      return transitionData(flags()).closed;
    },
    get enter() {
      return transitionData(flags()).enter;
    },
    get leave() {
      return transitionData(flags()).leave;
    },
    get transition() {
      return transitionData(flags()).transition;
    },
  };

  return { data };
}

function runTransition(
  node: HTMLElement,
  options: {
    done(): void;
    inFlight(): boolean;
    prepare(): void;
    run(): void;
  },
): () => void {
  const scheduled = disposables();

  prepareTransition(node, options.inFlight, options.prepare);
  scheduled.nextFrame(() => {
    options.run();
    scheduled.requestAnimationFrame(() => {
      scheduled.add(waitForTransition(node, options.done));
    });
  });

  return scheduled.dispose;
}

function prepareTransition(
  node: HTMLElement,
  inFlight: () => boolean,
  prepare: () => void,
): void {
  if (inFlight()) {
    prepare();
    return;
  }

  const previous = node.style.transition;
  node.style.transition = "none";
  prepare();
  node.offsetHeight;
  node.style.transition = previous;
}

function cssTransitions(node: HTMLElement): Animation[] {
  const view = node.ownerDocument.defaultView as
    | (Window & { CSSTransition?: typeof CSSTransition })
    | null;
  const TransitionConstructor = view?.CSSTransition;

  return (node.getAnimations?.() ?? []).filter((animation) => {
    if (TransitionConstructor) {
      return animation instanceof TransitionConstructor;
    }
    return animation.constructor?.name === "CSSTransition";
  });
}

function waitForTransition(
  node: HTMLElement | null,
  done: () => void,
): () => void {
  const scheduled = disposables();
  if (!node) return scheduled.dispose;

  let cancelled = false;
  scheduled.add(() => cancelled = true);

  const transitions = cssTransitions(node);
  if (transitions.length === 0) {
    done();
    return scheduled.dispose;
  }

  Promise.allSettled(transitions.map((transition) => transition.finished)).then(
    () => {
      if (!cancelled) done();
    },
  );
  return scheduled.dispose;
}

function hasPendingTransitions(node: HTMLElement): boolean {
  return cssTransitions(node).some((animation) =>
    animation.playState !== "finished"
  );
}
