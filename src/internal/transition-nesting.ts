export type TransitionDirection = "enter" | "leave";

export enum TransitionTreeState {
  Visible = "visible",
  Hidden = "hidden",
}

interface PendingTransition {
  direction: TransitionDirection;
  promise: Promise<void>;
  resolve(): void;
  token: symbol;
}

export interface TransitionRegistration {
  element: () => HTMLElement | null;
  pending: PendingTransition | null;
  revision: number;
  state: TransitionTreeState;
}

export function createTransitionRegistration(
  element: () => HTMLElement | null,
  state: TransitionTreeState,
): TransitionRegistration {
  return { element, pending: null, revision: 0, state };
}

export interface TransitionNesting {
  hasVisibleChildren(): boolean;
  markHidden(registration: TransitionRegistration): void;
  markVisible(registration: TransitionRegistration): void;
  register(registration: TransitionRegistration): () => void;
  settle(registration: TransitionRegistration, token: symbol): void;
  start(
    registration: TransitionRegistration,
    direction: TransitionDirection,
  ): symbol;
  waitForChildren(direction: TransitionDirection): Promise<void>;
}

export function createTransitionNesting(
  onEmpty?: () => void,
): TransitionNesting {
  const registrations = new Set<TransitionRegistration>();
  let resolveChange = () => {};
  let nextChange = new Promise<void>((resolve) => resolveChange = resolve);

  const notifyChange = () => {
    const resolve = resolveChange;
    nextChange = new Promise<void>((nextResolve) => {
      resolveChange = nextResolve;
    });
    resolve();
  };

  const resolvePending = (registration: TransitionRegistration) => {
    registration.pending?.resolve();
    registration.pending = null;
    notifyChange();
  };

  const notifyIfEmpty = () => {
    queueMicrotask(() => {
      if (
        ![...registrations].some((child) =>
          child.element() !== null &&
          child.state === TransitionTreeState.Visible
        )
      ) {
        onEmpty?.();
      }
    });
  };

  const api: TransitionNesting = {
    hasVisibleChildren() {
      return [...registrations].some((child) =>
        child.element() !== null && child.state === TransitionTreeState.Visible
      );
    },
    markHidden(registration) {
      registration.state = TransitionTreeState.Hidden;
      notifyChange();
      notifyIfEmpty();
    },
    markVisible(registration) {
      registration.state = TransitionTreeState.Visible;
      notifyChange();
    },
    register(registration) {
      registrations.add(registration);
      notifyChange();
      return () => {
        resolvePending(registration);
        registrations.delete(registration);
        notifyChange();
        notifyIfEmpty();
      };
    },
    settle(registration, token) {
      if (registration.pending?.token !== token) return;
      resolvePending(registration);
    },
    start(registration, direction) {
      resolvePending(registration);
      registration.state = TransitionTreeState.Visible;
      registration.revision += 1;

      const token = Symbol(direction);
      let resolve = () => {};
      const promise = new Promise<void>((done) => resolve = done);
      registration.pending = { direction, promise, resolve, token };
      notifyChange();
      return token;
    },
    async waitForChildren(direction) {
      const published = new Set<TransitionRegistration>();
      const baseline = new Map(
        [...registrations].map((registration) => {
          if (registration.pending?.direction === direction) {
            published.add(registration);
          }
          return [registration, registration.revision];
        }),
      );

      // Give every child effect from the current update a chance to publish
      // its transition before taking the first promise snapshot.
      await Promise.resolve();
      await Promise.resolve();

      while (true) {
        const change = nextChange;
        const pending: Promise<void>[] = [];

        for (const child of registrations) {
          if (!baseline.has(child)) continue;
          if (
            child.element() === null ||
            child.state === TransitionTreeState.Hidden
          ) {
            published.add(child);
            continue;
          }

          if (child.revision !== baseline.get(child)) {
            published.add(child);
          }

          if (child.pending?.direction === direction) {
            published.add(child);
            pending.push(child.pending.promise);
          }
        }

        if (pending.length === 0) {
          const waitingForPublication = [...baseline.keys()].some((child) =>
            registrations.has(child) &&
            child.element() !== null &&
            child.state === TransitionTreeState.Visible &&
            !published.has(child)
          );
          if (!waitingForPublication) return;
          await change;
          continue;
        }

        await Promise.all(pending);
      }
    },
  };

  return api;
}
