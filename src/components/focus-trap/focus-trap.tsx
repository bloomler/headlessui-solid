import {
  type Accessor,
  createEffect,
  createSignal,
  type Element,
  omit,
  onSettled,
  Show,
  untrack,
} from "solid-js";
import type { JSX, ValidComponent } from "@solidjs/web";
import { FocusTrapFeatures } from "./focus-trap-features.ts";
import {
  containsFocusTrapTarget,
  type FocusTrapContainers,
  type FocusTrapElementReference,
  resolveFocusTrapContainers,
  resolveFocusTrapElement,
} from "../../internal/focus-trap-helpers.ts";
import {
  createEventListener,
  createTabDirection,
  TabDirection,
} from "../../primitives/events.ts";
import { createIsTopLayer } from "../../primitives/top-layer.ts";
import type { Props, Ref } from "../../types.ts";
import { history } from "../../utils/active-element-history.ts";
import { disposables } from "../../utils/disposables.ts";
import * as DOM from "../../utils/dom.ts";
import { env } from "../../utils/env.ts";
import {
  Focus,
  focusElement,
  focusIn,
  FocusResult,
} from "../../utils/focus-management.ts";
import { getOwnerDocument, isActiveElement } from "../../utils/owner.ts";
import type { AnyProps } from "../../utils/merge-event-props.ts";
import { renderElement } from "../../utils/render.tsx";

const DEFAULT_FOCUS_TRAP_TAG = "div" as const;

const DEFAULT_FOCUS_TRAP_FEATURES = FocusTrapFeatures.InitialFocus |
  FocusTrapFeatures.TabLock |
  FocusTrapFeatures.FocusLock |
  FocusTrapFeatures.RestoreFocus;

function assignRef<T>(reference: Ref<T> | undefined, value: T): void {
  if (typeof reference === "function") {
    (reference as (element: T) => void)(value);
    return;
  }

  if (!Array.isArray(reference)) return;
  for (const nested of reference) {
    assignRef(nested as Ref<T>, value);
  }
}

type FocusTrapRenderPropArg = Record<never, never>;

/**
 * Props accepted by the focus trap component.
 */
export type FocusTrapProps<
  TTag extends ValidComponent = typeof DEFAULT_FOCUS_TRAP_TAG,
> = Props<
  TTag,
  FocusTrapRenderPropArg,
  never,
  {
    containers?: FocusTrapContainers;
    features?: FocusTrapFeatures;
    initialFocus?: FocusTrapElementReference;
    initialFocusFallback?: FocusTrapElementReference;
  },
  HTMLElement
>;

const FOCUS_GUARD_STYLE: JSX.CSSProperties = {
  "border-width": "0",
  clip: "rect(0, 0, 0, 0)",
  height: "0",
  left: "1px",
  margin: "-1px",
  overflow: "hidden",
  padding: "0",
  position: "fixed",
  top: "1px",
  "white-space": "nowrap",
  width: "1px",
};

function createServerHandoffComplete(): Accessor<boolean> {
  const [complete, setComplete] = createSignal(env.isHandoffComplete);

  onSettled(() => {
    if (env.isServer) return;
    env.handoff();
    setComplete(true);
  });

  return complete;
}

function FocusGuard(props: { onFocus: (event: FocusEvent) => void }): Element {
  return (
    <button
      type="button"
      aria-hidden="true"
      data-headlessui-focus-guard="true"
      onFocus={props.onFocus}
      style={FOCUS_GUARD_STYLE}
    />
  );
}

function FocusTrapRoot<
  TTag extends ValidComponent = typeof DEFAULT_FOCUS_TRAP_TAG,
>(props: FocusTrapProps<TTag>): Element {
  const [container, setContainer] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });
  const handoffComplete = createServerHandoffComplete();
  const requestedFeatures = () => props.features ?? DEFAULT_FOCUS_TRAP_FEATURES;
  const features = () =>
    handoffComplete() ? requestedFeatures() : FocusTrapFeatures.None;
  const hasFeature = (feature: FocusTrapFeatures) => () =>
    Boolean(features() & feature);
  const ownerWindow = () => getOwnerDocument(container())?.defaultView ?? null;

  const tabLockEnabled = createIsTopLayer(
    hasFeature(FocusTrapFeatures.TabLock),
    "focus-trap#tab-lock",
  );
  const initialFocusEnabled = createIsTopLayer(
    hasFeature(FocusTrapFeatures.InitialFocus),
    "focus-trap#initial-focus",
  );
  const tabDirection = createTabDirection(ownerWindow);

  let previousActiveElement: HTMLElement | null = null;
  let initializedInitialFocus = false;
  let mounted = true;
  let localHistory = history.slice();
  let restoreFocusEnabled = untrack(
    hasFeature(FocusTrapFeatures.RestoreFocus),
  );
  let clearHistoryGeneration = 0;

  const getRestoreElement = () =>
    localHistory.find((element) => element?.isConnected) ?? null;

  createEffect(
    () => ({
      enabled: hasFeature(FocusTrapFeatures.RestoreFocus)(),
      ownerDocument: getOwnerDocument(container()),
    }),
    (snapshot, previousSnapshot) => {
      const enabled = snapshot.enabled;
      const previousEnabled = previousSnapshot?.enabled;
      restoreFocusEnabled = enabled;

      if (previousEnabled === false && enabled) {
        clearHistoryGeneration += 1;
        localHistory = history.slice();
        return;
      }

      if (previousEnabled !== true || enabled) return;

      if (isActiveElement(snapshot.ownerDocument?.body)) {
        focusElement(getRestoreElement());
      }

      const generation = ++clearHistoryGeneration;
      queueMicrotask(() => {
        if (generation === clearHistoryGeneration && !restoreFocusEnabled) {
          localHistory = [];
        }
      });
    },
  );

  onSettled(() => () => {
    // Disposal can run before the window focus listener is removed. Mark the
    // trap inactive first so its own FocusLock cannot reject the restoration.
    mounted = false;
    clearHistoryGeneration += 1;
    if (!restoreFocusEnabled) return;

    const restoreElement = getRestoreElement();
    // Solid disposes the owner while the focused descendant is still in the
    // DOM. Deferring one microtask lets native focusout finish and prevents
    // the disappearing trap from reclaiming focus during its own teardown.
    queueMicrotask(() => {
      if (restoreElement?.isConnected) focusElement(restoreElement);
    });
  });

  createEffect(
    () => ({
      container: container(),
      enabled: initialFocusEnabled(),
      fallback: resolveFocusTrapElement(props.initialFocusFallback),
      features: features(),
      initial: resolveFocusTrapElement(props.initialFocus),
      requested: hasFeature(FocusTrapFeatures.InitialFocus)(),
    }),
    (snapshot) => {
      if (!snapshot.requested) initializedInitialFocus = false;
      if (snapshot.features === FocusTrapFeatures.None) return;

      // Losing top-layer ownership to a nested trap must not start a second
      // initial-focus cycle when ownership returns. The nested trap restores
      // its opener; re-running this trap's autofocus pass afterwards would
      // overwrite that restoration (usually with the first data-autofocus
      // element in the outer trap).
      if (snapshot.enabled && initializedInitialFocus) return;

      const scheduled = disposables();
      scheduled.microTask(() => {
        const containerElement = snapshot.container;
        if (!containerElement) return;

        const moveInitialFocus = (): boolean => {
          if (!containerElement.isConnected) return false;

          if (!snapshot.enabled) {
            focusElement(snapshot.fallback);
            return true;
          }

          // A second tracked pass may have completed while this one waited
          // for its portalled template node to be adopted into the document.
          if (initializedInitialFocus) return true;
          initializedInitialFocus = true;

          const ownerDocument = getOwnerDocument(containerElement);
          const activeElement = DOM.isHTMLElement(ownerDocument?.activeElement)
            ? ownerDocument.activeElement
            : null;

          if (snapshot.initial) {
            if (snapshot.initial === activeElement) {
              previousActiveElement = activeElement;
              return true;
            }
          } else if (
            activeElement && containerElement.contains(activeElement)
          ) {
            previousActiveElement = activeElement;
            return true;
          }

          if (snapshot.initial) {
            focusElement(snapshot.initial);
          } else {
            const autofocus = Boolean(
              snapshot.features & FocusTrapFeatures.AutoFocus,
            );
            const result = focusIn(
              containerElement,
              Focus.First | (autofocus ? Focus.AutoFocus : 0),
            );

            if (result === FocusResult.Error && snapshot.fallback) {
              focusElement(snapshot.fallback);
            } else if (result === FocusResult.Error) {
              console.warn(
                "There are no focusable elements inside the <FocusTrap />",
              );
            }
          }

          previousActiveElement = DOM.isHTMLElement(
              ownerDocument?.activeElement,
            )
            ? ownerDocument.activeElement
            : null;
          return true;
        };

        if (moveInitialFocus()) return;

        // Solid assigns refs while a Portal subtree is still backed by a
        // disconnected template document. A single microtask is not enough
        // when a Transition boundary and Portal each enqueue their own work,
        // so wait for adoption instead of silently abandoning initial focus.
        const ownerDocument = getOwnerDocument(containerElement);
        const Observer = ownerDocument?.defaultView?.MutationObserver;
        if (!ownerDocument || !Observer) return;

        const observer = new Observer(() => {
          if (!moveInitialFocus()) return;
          observer.disconnect();
        });
        observer.observe(ownerDocument, { childList: true, subtree: true });
        scheduled.add(() => observer.disconnect());

        // Cover adoption that occurred between the first connectivity check
        // and observer installation.
        if (moveInitialFocus()) observer.disconnect();
      });

      return scheduled.dispose;
    },
  );

  const allowedContainers = () => {
    const all = resolveFocusTrapContainers(props.containers);
    const root = container();
    if (root) all.add(root);
    return all;
  };

  createEventListener(
    () => hasFeature(FocusTrapFeatures.FocusLock)() ? ownerWindow() : null,
    "focus",
    (event: FocusEvent) => {
      if (!mounted) return;
      const all = allowedContainers();
      const target = DOM.isHTMLElement(event.target) ? event.target : null;

      if (!target) {
        focusElement(previousActiveElement);
        return;
      }

      // Let the guard receive the native event so it can wrap focus itself.
      if (target.dataset.headlessuiFocusGuard === "true") return;

      if (containsFocusTrapTarget(all, target)) {
        previousActiveElement = target;
        return;
      }

      if (!previousActiveElement?.isConnected) return;
      event.preventDefault();
      event.stopPropagation();
      focusElement(previousActiveElement);
    },
    true,
  );

  let recentlyUsedTabKey = false;
  let cancelTabReset = () => {};

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    recentlyUsedTabKey = true;
    cancelTabReset();

    const view = ownerWindow();
    if (!view) return;
    const frame = view.requestAnimationFrame(() => {
      recentlyUsedTabKey = false;
      cancelTabReset = () => {};
    });
    cancelTabReset = () => view.cancelAnimationFrame(frame);
  };

  onSettled(() => () => cancelTabReset());

  const handleFocusOut = (event: FocusEvent) =>
    untrack(() => {
      // Removing a focused child can dispatch `focusout` synchronously from
      // inside Solid's renderer effect. Treat the native event as an
      // imperative boundary so reads here are not attributed to that
      // untracked apply phase.
      if (!mounted) return;
      if (!hasFeature(FocusTrapFeatures.FocusLock)()) return;
      const root = container();
      if (!root) return;

      const target = DOM.isHTMLElement(event.target) ? event.target : null;
      const relatedTarget = DOM.isHTMLorSVGElement(event.relatedTarget)
        ? event.relatedTarget
        : null;
      if (!target || !relatedTarget) return;

      if (relatedTarget.dataset.headlessuiFocusGuard === "true") return;
      if (containsFocusTrapTarget(allowedContainers(), relatedTarget)) return;

      if (recentlyUsedTabKey) {
        focusIn(
          root,
          (tabDirection() === TabDirection.Forwards
            ? Focus.Next
            : Focus.Previous) | Focus.WrapAround,
          { relativeTo: target },
        );
        return;
      }

      focusElement(target);
    });

  const handleGuardFocus = (event: FocusEvent) => {
    const root = container();
    if (!root) return;

    const relatedTarget = DOM.isHTMLElement(event.relatedTarget)
      ? event.relatedTarget
      : null;
    focusIn(
      root,
      tabDirection() === TabDirection.Forwards ? Focus.First : Focus.Last,
      {
        skipElements: [
          relatedTarget,
          resolveFocusTrapElement(props.initialFocusFallback),
        ],
      },
    );
  };

  const ourProps: AnyProps = {
    ref(element: HTMLElement) {
      assignRef(props.ref as Ref<HTMLElement>, element);
      setContainer(element);
    },
    // The native container-level event is `focusout`.
    onFocusOut: handleFocusOut,
    onKeyDown: handleKeyDown,
  };

  const content = renderElement({
    defaultTag: DEFAULT_FOCUS_TRAP_TAG,
    name: "FocusTrap",
    ourProps,
    slot: {},
    theirProps: omit(
      props as AnyProps,
      "containers",
      "features",
      "initialFocus",
      "initialFocusFallback",
      "ref",
    ),
  });

  return (
    <>
      <Show when={tabLockEnabled()}>
        <FocusGuard onFocus={handleGuardFocus} />
      </Show>
      {content}
      <Show when={tabLockEnabled()}>
        <FocusGuard onFocus={handleGuardFocus} />
      </Show>
    </>
  );
}

/**
 * Renders the accessible, unstyled focus trap component for Solid.
 */
export const FocusTrap: typeof FocusTrapRoot & {
  features: typeof FocusTrapFeatures;
} = Object.assign(FocusTrapRoot, {
  /** @deprecated Use the named `FocusTrapFeatures` export. */
  features: FocusTrapFeatures,
});

export type {
  FocusTrapContainers,
  FocusTrapElementReference,
} from "../../internal/focus-trap-helpers.ts";
export { FocusTrapFeatures } from "./focus-trap-features.ts";
