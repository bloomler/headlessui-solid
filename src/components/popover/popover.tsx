import {
  type Accessor,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  type Element,
  flush,
  omit,
  onSettled,
  Show,
  untrack,
  useContext,
} from "solid-js";
import type { JSX, ValidComponent } from "@solidjs/web";
import { CloseProvider } from "../../internal/close-provider.tsx";
import {
  type AnchorProps,
  type AnchorTo,
  FloatingProvider,
  useFloatingPanel,
  useFloatingPanelProps,
  useFloatingReference,
  useFloatingReferenceProps,
  useResolvedAnchor,
} from "../../internal/floating.tsx";
import { Hidden, HiddenFeatures } from "../../internal/hidden.tsx";
import {
  OpenClosedProvider,
  OpenClosedState,
  ResetOpenClosedProvider,
  useOpenClosed,
} from "../../internal/open-closed.tsx";
import { createElementSize } from "../../primitives/element-size.ts";
import {
  createDocumentEvent,
  createTabDirection,
  TabDirection,
} from "../../primitives/events.ts";
import {
  createActivePress,
  createFocusRing,
  createHover,
} from "../../primitives/interactions.ts";
import { createOnDisappear } from "../../primitives/on-disappear.ts";
import { createOutsideClick } from "../../primitives/outside-click.ts";
import {
  createRootContainers,
  MainTreeProvider,
  useMainTreeNode,
} from "../../primitives/root-containers.tsx";
import { createScrollLock } from "../../primitives/scroll-lock.ts";
import { createTransition } from "../../primitives/transition.ts";
import type { Props, Ref } from "../../types.ts";
import { isDisabledByFieldset } from "../../utils/bugs.ts";
import * as DOM from "../../utils/dom.ts";
import {
  Focus,
  FocusableMode,
  focusIn,
  FocusResult,
  getFocusableElements,
  isFocusableElement,
} from "../../utils/focus-management.ts";
import type { AnyProps } from "../../utils/merge-event-props.ts";
import {
  getActiveElement,
  getOwnerDocument,
  getRootNode,
} from "../../utils/owner.ts";
import {
  mergeEventProps,
  type PropsForFeatures,
  renderElement,
  RenderFeatures,
} from "../../utils/render.tsx";
import { Portal, useNestedPortals } from "../portal/portal.tsx";
import {
  type MutableElementRef,
  type PopoverCloseTarget,
  PopoverMachine,
  type PopoverMachineState,
  PopoverStates,
} from "./popover-machine.ts";

export { PopoverStates } from "./popover-machine.ts";
export type { PopoverCloseTarget } from "./popover-machine.ts";

/**
 * Anchor configuration accepted by the popover component family.
 */
export type PopoverAnchor = AnchorProps;
/**
 * Placement values accepted by anchored popover content.
 */
export type PopoverAnchorTo = AnchorTo;
/**
 * Floating-position configuration for anchored popover content.
 */
export type PopoverAnchorConfig = Exclude<AnchorProps, boolean | string>;

interface PopoverContextValue {
  readonly machine: PopoverMachine;
  readonly state: Accessor<Readonly<PopoverMachineState>>;
}

interface PopoverRegisterBag {
  readonly buttonId: { readonly current: string | null };
  readonly close: () => void;
  readonly panelId: { readonly current: string | null };
}

interface PopoverGroupContextValue {
  readonly closeOthers: (buttonId: string) => void;
  readonly isFocusWithinPopoverGroup: () => boolean;
  readonly registerPopover: (bag: PopoverRegisterBag) => () => void;
}

const PopoverContext = createContext<PopoverContextValue>();
const PopoverGroupContext = createContext<PopoverGroupContextValue | null>(
  null,
);
const PopoverPanelContext = createContext<string | null>(null);

function registerReactiveId(
  value: Accessor<string>,
  current: () => string | null,
  update: (value: string | null) => void,
): void {
  let registered = untrack(value);

  createEffect(
    value,
    (next) => {
      registered = next;
      update(next);
    },
    { defer: true },
  );

  onSettled(() => {
    update(registered);
    return () => {
      if (current() === registered) update(null);
    };
  });
}

type StyleRecord = Record<string, string | number | undefined>;

function styleString(style: StyleRecord): string {
  return Object.entries(style)
    .filter((entry): entry is [string, string | number] =>
      entry[1] !== undefined
    )
    .map(([property, value]) => {
      const name = property.startsWith("--")
        ? property
        : property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
      return `${name}:${value}`;
    }).join(";");
}

function mergeStyle(user: unknown, system: StyleRecord): unknown {
  if (typeof user === "string") {
    const suffix = styleString(system);
    return suffix ? `${user};${suffix}` : user;
  }
  if (typeof user === "object" && user !== null) {
    return { ...(user as Record<string, unknown>), ...system };
  }
  return system;
}

function FocusSentinel(props: {
  id: string;
  onFocus: () => void;
  sentinel: MutableElementRef<HTMLButtonElement>;
}): Element {
  let current: HTMLButtonElement | null = null;

  onSettled(() => () => {
    if (props.sentinel.current === current) props.sentinel.current = null;
  });

  return (
    <Hidden
      as="button"
      type="button"
      id={props.id}
      features={HiddenFeatures.Focusable}
      data-headlessui-focus-guard="true"
      ref={(element) => {
        current = element as HTMLButtonElement;
        props.sentinel.current = current;
      }}
      onFocus={props.onFocus}
    />
  );
}

const DEFAULT_POPOVER_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the popover component.
 */
export type PopoverRenderPropArg = Readonly<{
  close: (target?: PopoverCloseTarget) => void;
  open: boolean;
}>;

/**
 * Props accepted by the popover component.
 */
export type PopoverProps<
  TTag extends ValidComponent = typeof DEFAULT_POPOVER_TAG,
> = Props<
  TTag,
  PopoverRenderPropArg,
  never,
  { __demoMode?: boolean },
  HTMLElement
>;

function PopoverRoot<
  TTag extends ValidComponent = typeof DEFAULT_POPOVER_TAG,
>(props: PopoverProps<TTag>): Element {
  const id = `headlessui-popover-${createUniqueId()}`;
  const machine = PopoverMachine.create({
    id,
    __demoMode: untrack(() => Boolean(props.__demoMode)),
  });
  const [state, setState] = createSignal<Readonly<PopoverMachineState>>(
    machine.state,
    { name: "popover-state", ownedWrite: true },
  );
  const context: PopoverContextValue = { machine, state };
  const group = useContext(PopoverGroupContext);
  let rootElementSnapshot: HTMLElement | null = null;
  const open = createMemo(() => state().popoverState === PopoverStates.Open);
  const [portals, PortalWrapper] = useNestedPortals();
  let currentPortals: readonly HTMLElement[] = [];

  createEffect(portals, (next) => {
    currentPortals = next;
  });

  const mainTreeNode = useMainTreeNode(() => machine.state.button);
  const containers = createRootContainers({
    defaultContainers: () => [machine.state.button, machine.state.panel],
    mainTreeNode: () => machine.state.button,
    portals: () => currentPortals,
  });
  const ownerDocument = () =>
    getOwnerDocument(machine.state.button ?? rootElementSnapshot);
  const isFocusWithinPopoverGroup = (): boolean => {
    const activeElement = getActiveElement(
      rootElementSnapshot ?? machine.state.button,
    );
    return group?.isFocusWithinPopoverGroup() ?? Boolean(
      activeElement &&
        (machine.state.button?.contains(activeElement) ||
          machine.state.panel?.contains(activeElement)),
    );
  };

  const registerBag: PopoverRegisterBag = {
    buttonId: {
      get current() {
        return machine.state.buttonId;
      },
    },
    close: machine.actions.close,
    panelId: {
      get current() {
        return machine.state.panelId;
      },
    },
  };

  // Child refs publish machine snapshots while the tree is being constructed.
  // Subscribe once hydration has claimed that tree so those writes cannot
  // replay an owner before its DOM claims are complete.
  onSettled(() => {
    const unsubscribe = machine.subscribe((current) => current, setState);
    setState(machine.state);
    const unregisterGroup = group?.registerPopover(registerBag);
    return () => {
      unregisterGroup?.();
      unsubscribe();
      machine.dispose();
    };
  });

  createDocumentEvent(
    () => true,
    "focus",
    (event) => {
      if (event.target === ownerDocument()?.defaultView) return;
      if (!DOM.isHTMLorSVGElement(event.target)) return;
      if (machine.state.popoverState !== PopoverStates.Open) return;
      if (isFocusWithinPopoverGroup()) return;
      if (!machine.state.button || !machine.state.panel) return;
      if (containers.contains(event.target)) return;
      if (machine.state.beforePanelSentinel.current?.contains(event.target)) {
        return;
      }
      if (machine.state.afterPanelSentinel.current?.contains(event.target)) {
        return;
      }
      if (machine.state.afterButtonSentinel.current?.contains(event.target)) {
        return;
      }
      machine.actions.close();
    },
    true,
    ownerDocument,
  );

  createOutsideClick(
    open,
    containers.resolveContainers,
    (event, target) => {
      machine.actions.close();
      if (!isFocusableElement(target, FocusableMode.Loose)) {
        event.preventDefault();
        machine.state.button?.focus({ preventScroll: true });
      }
    },
    ownerDocument,
  );

  const slot: PopoverRenderPropArg = {
    close: machine.actions.refocusableClose,
    get open() {
      return open();
    },
  };
  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return [props.ref as Ref<HTMLElement>, (next: HTMLElement | null) => {
        rootElementSnapshot = next;
      }];
    },
  };

  return (
    <MainTreeProvider node={mainTreeNode}>
      <FloatingProvider>
        <PopoverPanelContext value={null}>
          <PopoverContext value={context}>
            <CloseProvider value={machine.actions.refocusableClose}>
              <OpenClosedProvider
                value={() =>
                  open() ? OpenClosedState.Open : OpenClosedState.Closed}
              >
                <PortalWrapper>
                  {renderElement({
                    defaultTag: DEFAULT_POPOVER_TAG,
                    name: "Popover",
                    ourProps,
                    slot,
                    stateKeys: ["open"],
                    theirProps: omit(props as AnyProps, "__demoMode", "ref"),
                  })}
                </PortalWrapper>
              </OpenClosedProvider>
            </CloseProvider>
          </PopoverContext>
        </PopoverPanelContext>
      </FloatingProvider>
    </MainTreeProvider>
  );
}

const DEFAULT_BUTTON_TAG = "button" as const;

/**
 * Reactive state exposed to render-prop children of the popover button component.
 */
export type PopoverButtonRenderPropArg = Readonly<{
  active: boolean;
  autofocus: boolean;
  disabled: boolean;
  focus: boolean;
  hover: boolean;
  open: boolean;
}>;

type PopoverButtonPropsWeControl = "aria-controls" | "aria-expanded";

/**
 * Props accepted by the popover button component.
 */
export type PopoverButtonProps<
  TTag extends ValidComponent = typeof DEFAULT_BUTTON_TAG,
> = Props<
  TTag,
  PopoverButtonRenderPropArg,
  PopoverButtonPropsWeControl,
  {
    autofocus?: boolean;
    disabled?: boolean;
    type?: "button" | "reset" | "submit";
  },
  HTMLElement
>;

/**
 * Renders the button for the popover component family.
 */
export function PopoverButton<
  TTag extends ValidComponent = typeof DEFAULT_BUTTON_TAG,
>(props: PopoverButtonProps<TTag>): Element {
  const context = useContext(PopoverContext);
  const generatedId = `headlessui-popover-button-${createUniqueId()}`;
  const sentinelId = `headlessui-focus-sentinel-${createUniqueId()}`;
  const group = useContext(PopoverGroupContext);
  const panelContext = useContext(PopoverPanelContext);
  const isWithinPanel = panelContext !== null;
  const [element, setElement] = createSignal<HTMLElement | null>(null, {
    name: "popover-button-element",
    ownedWrite: true,
  });
  let elementSnapshot: HTMLElement | null = null;
  const id = () => props.id ?? generatedId;
  const disabled = () => Boolean(props.disabled);
  const autofocus = () => Boolean(props.autofocus);
  const open = createMemo(() =>
    context.state().popoverState === PopoverStates.Open
  );
  const isPortalled = createMemo(() =>
    context.machine.selectors.isPortalled(
      context.state() as PopoverMachineState,
    )
  );
  const floatingReference = useFloatingReference();
  const floatingReferenceProps = useFloatingReferenceProps();
  const identifier = Symbol("popover-button");

  if (!isWithinPanel) {
    registerReactiveId(
      id,
      () => context.machine.state.buttonId,
      context.machine.actions.setButtonId,
    );
  }

  const setButtonElement = (next: HTMLElement | null): void => {
    if (elementSnapshot === next) return;

    if (!isWithinPanel && elementSnapshot) {
      const index = context.machine.state.buttons.current.indexOf(identifier);
      if (index !== -1) context.machine.state.buttons.current.splice(index, 1);
      if (context.machine.state.button === elementSnapshot) {
        context.machine.actions.setButton(null);
      }
    }

    elementSnapshot = next;
    setElement(next);
    if (isWithinPanel || next === null) return;

    context.machine.state.buttons.current.push(identifier);
    if (context.machine.state.buttons.current.length > 1) {
      console.warn(
        "You are already using a <Popover.Button /> but only 1 <Popover.Button /> is supported.",
      );
    }
    context.machine.actions.setButton(next);
  };

  onSettled(() => () => setButtonElement(null));

  const toggle = (): void => {
    if (context.machine.state.popoverState === PopoverStates.Closed) {
      group?.closeOthers(context.machine.state.buttonId ?? id());
      context.machine.actions.open();
    } else {
      context.machine.actions.close();
    }
  };

  const handleKeyDown = (
    event: KeyboardEvent & { currentTarget: HTMLElement },
  ): void => {
    if (isWithinPanel) {
      if (context.machine.state.popoverState === PopoverStates.Closed) return;
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      event.currentTarget.click();
      context.machine.actions.close();
      context.machine.state.button?.focus({ preventScroll: true });
      return;
    }

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      toggle();
      return;
    }

    if (event.key !== "Escape") return;
    if (context.machine.state.popoverState !== PopoverStates.Open) {
      group?.closeOthers(context.machine.state.buttonId ?? id());
      return;
    }
    if (!elementSnapshot) return;
    const activeElement = getActiveElement(elementSnapshot);
    if (activeElement && !elementSnapshot.contains(activeElement)) return;
    event.preventDefault();
    event.stopPropagation();
    context.machine.actions.close();
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    if (!isWithinPanel && event.key === " ") event.preventDefault();
  };

  const handleClick = (
    event: MouseEvent & { currentTarget: HTMLElement },
  ): void => {
    if (
      isDisabledByFieldset(event.currentTarget) || disabled()
    ) return;

    if (isWithinPanel) {
      context.machine.actions.close();
      context.machine.state.button?.focus({ preventScroll: true });
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    toggle();
    context.machine.state.button?.focus({ preventScroll: true });
  };

  const handleMouseDown = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  const focusRing = createFocusRing({ disabled, focusVisibleOnly: true });
  const hover = createHover({ disabled });
  const activePress = createActivePress({ disabled });
  const slot: PopoverButtonRenderPropArg = {
    get active() {
      return activePress.pressed() || open();
    },
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
    get open() {
      return open();
    },
  };

  const theirProps = omit(
    props as AnyProps,
    "autofocus",
    "disabled",
    "id",
    "ref",
    "type",
  );
  const commonProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return isWithinPanel
        ? [props.ref as Ref<HTMLElement>, setButtonElement]
        : [
          props.ref as Ref<HTMLElement>,
          floatingReference,
          setButtonElement,
        ];
    },
    get type() {
      if (props.type) return props.type;
      const tag = props.as ?? DEFAULT_BUTTON_TAG;
      if (typeof tag === "string" && tag.toLowerCase() === "button") {
        return "button";
      }
      const resolved = element();
      return resolved?.tagName === "BUTTON" && !resolved.hasAttribute("type")
        ? "button"
        : undefined;
    },
    get disabled() {
      return disabled() || undefined;
    },
    get autofocus() {
      return autofocus() || undefined;
    },
    onClick: handleClick,
    onKeyDown: handleKeyDown,
  };
  const rootButtonProps: AnyProps = isWithinPanel ? {} : {
    get id() {
      return id();
    },
    get "aria-controls"() {
      return context.machine.state.panel
        ? context.machine.state.panelId ?? undefined
        : undefined;
    },
    get "aria-expanded"() {
      return open() ? "true" : "false";
    },
    onKeyUp: handleKeyUp,
    onMouseDown: handleMouseDown,
  };
  const ourProps = mergeEventProps(
    floatingReferenceProps,
    commonProps,
    rootButtonProps,
    focusRing.focusProps,
    hover.hoverProps,
    activePress.pressProps,
  );

  const direction = createTabDirection(() =>
    context.machine.state.button?.ownerDocument.defaultView ??
      (typeof window === "undefined" ? null : window)
  );
  const handleSentinelFocus = (): void => {
    const panel = context.machine.state.panel;
    if (!panel) return;

    queueMicrotask(() => {
      const result = direction() === TabDirection.Forwards
        ? focusIn(panel, Focus.First)
        : focusIn(panel, Focus.Last);
      if (result !== FocusResult.Error) return;

      const elements = getFocusableElements(getRootNode(
        context.machine.state.button,
      )).filter((candidate) =>
        candidate.dataset.headlessuiFocusGuard !== "true"
      );
      focusIn(
        elements,
        direction() === TabDirection.Forwards ? Focus.Next : Focus.Previous,
        { relativeTo: context.machine.state.button },
      );
    });
  };

  return (
    <>
      {renderElement({
        defaultTag: DEFAULT_BUTTON_TAG,
        name: "Popover.Button",
        ourProps,
        slot,
        stateKeys: [
          "open",
          "active",
          "disabled",
          "hover",
          "focus",
          "autofocus",
        ],
        theirProps,
      })}
      <Show when={open() && !isWithinPanel && isPortalled()}>
        <FocusSentinel
          id={sentinelId}
          sentinel={context.machine.state.afterButtonSentinel}
          onFocus={handleSentinelFocus}
        />
      </Show>
    </>
  );
}

const DEFAULT_BACKDROP_TAG = "div" as const;
const BACKDROP_RENDER_FEATURES = RenderFeatures.RenderStrategy |
  RenderFeatures.Static;

/**
 * Reactive state exposed to render-prop children of the popover backdrop component.
 */
export type PopoverBackdropRenderPropArg = Readonly<{ open: boolean }>;

type PopoverBackdropPropsWeControl = "aria-hidden";

/**
 * Props accepted by the popover backdrop component.
 */
export type PopoverBackdropProps<
  TTag extends ValidComponent = typeof DEFAULT_BACKDROP_TAG,
> = Props<
  TTag,
  PopoverBackdropRenderPropArg,
  PopoverBackdropPropsWeControl,
  & { transition?: boolean }
  & PropsForFeatures<typeof BACKDROP_RENDER_FEATURES>,
  HTMLElement
>;

/** @deprecated Use `PopoverBackdropProps` instead. */
/**
 * Props accepted by the popover overlay component.
 */
export type PopoverOverlayProps<
  TTag extends ValidComponent = typeof DEFAULT_BACKDROP_TAG,
> = PopoverBackdropProps<TTag>;

/**
 * Renders the backdrop for the popover component family.
 */
export function PopoverBackdrop<
  TTag extends ValidComponent = typeof DEFAULT_BACKDROP_TAG,
>(props: PopoverBackdropProps<TTag>): Element {
  const context = useContext(PopoverContext);
  const generatedId = `headlessui-popover-backdrop-${createUniqueId()}`;
  const [element, setElement] = createSignal<HTMLElement | null>(null, {
    name: "popover-backdrop-element",
    ownedWrite: true,
  });
  const open = createMemo(() =>
    context.state().popoverState === PopoverStates.Open
  );
  const openClosed = useOpenClosed();
  const show = () =>
    openClosed !== null
      ? (openClosed() & OpenClosedState.Open) === OpenClosedState.Open
      : open();
  const transitionEnabled = () => Boolean(props.transition);
  const [visible, setVisible] = createSignal(
    context.machine.state.popoverState === PopoverStates.Open,
    { name: "popover-backdrop-visible", ownedWrite: true },
  );
  const [initial, setInitial] = createSignal(true, {
    name: "popover-backdrop-initial",
    ownedWrite: true,
  });
  const [ready, setReady] = createSignal(false, {
    name: "popover-backdrop-ready",
    ownedWrite: true,
  });

  createEffect(
    () => ({ open: show(), transition: transitionEnabled() }),
    (snapshot, previous) => {
      if (previous !== undefined && snapshot.open !== previous.open) {
        setInitial(false);
      }
      if (snapshot.open) setVisible(true);
      else if (!snapshot.transition) setVisible(false);
    },
  );
  const transition = createTransition({
    element,
    enabled: () =>
      transitionEnabled() && ready() && !initial() && element() !== null,
    show,
    end(nextOpen) {
      if (!nextOpen) setVisible(false);
    },
  });
  onSettled(() => {
    setReady(true);
  });

  const handleClick = (
    event: MouseEvent & { currentTarget: HTMLElement },
  ): void => {
    if (isDisabledByFieldset(event.currentTarget)) {
      event.preventDefault();
      return;
    }
    context.machine.actions.close();
  };

  const slot: PopoverBackdropRenderPropArg = {
    get open() {
      return open();
    },
  };
  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return [props.ref as Ref<HTMLElement>, setElement];
    },
    get id() {
      return props.id ?? generatedId;
    },
    "aria-hidden": "true",
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
    onClick: handleClick,
  };

  return renderElement({
    defaultTag: DEFAULT_BACKDROP_TAG,
    features: BACKDROP_RENDER_FEATURES,
    name: "Popover.Backdrop",
    ourProps,
    slot,
    stateKeys: ["open"],
    theirProps: omit(props as AnyProps, "id", "ref", "transition"),
    visible,
  });
}

/**
 * Renders the overlay for the popover component family.
 *
 * @deprecated Use `<PopoverBackdrop>` instead.
 */
export const PopoverOverlay = PopoverBackdrop;

const DEFAULT_PANEL_TAG = "div" as const;
const PANEL_RENDER_FEATURES = RenderFeatures.RenderStrategy |
  RenderFeatures.Static;

/**
 * Reactive state exposed to render-prop children of the popover panel component.
 */
export type PopoverPanelRenderPropArg = Readonly<{
  close: (target?: PopoverCloseTarget) => void;
  open: boolean;
}>;

type PopoverPanelPropsWeControl = "tabindex";

/**
 * Props accepted by the popover panel component.
 */
export type PopoverPanelProps<
  TTag extends ValidComponent = typeof DEFAULT_PANEL_TAG,
> = Props<
  TTag,
  PopoverPanelRenderPropArg,
  PopoverPanelPropsWeControl,
  & {
    anchor?: PopoverAnchor;
    focus?: boolean;
    modal?: boolean;
    portal?: boolean;
    transition?: boolean;
  }
  & PropsForFeatures<typeof PANEL_RENDER_FEATURES>,
  HTMLElement
>;

/**
 * Renders the panel for the popover component family.
 */
export function PopoverPanel<
  TTag extends ValidComponent = typeof DEFAULT_PANEL_TAG,
>(props: PopoverPanelProps<TTag>): Element {
  const context = useContext(PopoverContext);
  const generatedId = `headlessui-popover-panel-${createUniqueId()}`;
  const beforeSentinelId =
    `headlessui-focus-sentinel-before-${createUniqueId()}`;
  const afterSentinelId = `headlessui-focus-sentinel-after-${createUniqueId()}`;
  const [element, setElement] = createSignal<HTMLElement | null>(null, {
    name: "popover-panel-element",
    ownedWrite: true,
  });
  let elementSnapshot: HTMLElement | null = null;
  const id = () => props.id ?? generatedId;
  const focus = () => Boolean(props.focus);
  const modal = () => Boolean(props.modal);
  const open = createMemo(() =>
    context.state().popoverState === PopoverStates.Open
  );
  const isPortalled = createMemo(() =>
    context.machine.selectors.isPortalled(
      context.state() as PopoverMachineState,
    )
  );
  const openClosed = useOpenClosed();
  const show = () =>
    openClosed !== null
      ? (openClosed() & OpenClosedState.Open) === OpenClosedState.Open
      : open();
  const transitionEnabled = () => Boolean(props.transition);
  const [visible, setVisible] = createSignal(
    context.machine.state.popoverState === PopoverStates.Open,
    { name: "popover-panel-visible", ownedWrite: true },
  );
  const [initial, setInitial] = createSignal(true, {
    name: "popover-panel-initial",
    ownedWrite: true,
  });
  const [ready, setReady] = createSignal(false, {
    name: "popover-panel-ready",
    ownedWrite: true,
  });
  const anchor = useResolvedAnchor(() => props.anchor);
  const portalEnabled = () => Boolean(props.portal) || anchor() !== null;
  const [floatingRef, floatingStyles] = useFloatingPanel(anchor);
  const floatingPanelProps = useFloatingPanelProps();
  const buttonSize = createElementSize(
    visible,
    () => context.machine.state.button,
    true,
  );

  registerReactiveId(
    id,
    () => context.machine.state.panelId,
    context.machine.actions.setPanelId,
  );

  const setPanelElement = (next: HTMLElement | null): void => {
    elementSnapshot = next;
    setElement(next);
    context.machine.actions.setPanel(next);
  };

  createEffect(
    () => ({ open: show(), transition: transitionEnabled() }),
    (snapshot, previous) => {
      if (previous !== undefined && snapshot.open !== previous.open) {
        setInitial(false);
      }
      if (snapshot.open) setVisible(true);
      else if (!snapshot.transition) setVisible(false);
    },
  );
  const transition = createTransition({
    element,
    enabled: () =>
      transitionEnabled() && ready() && !initial() && element() !== null,
    show,
    end(nextOpen) {
      if (!nextOpen) setVisible(false);
    },
  });

  createEffect(
    () => ({
      demo: context.state().__demoMode,
      element: element(),
      focus: focus(),
      open: open(),
    }),
    (snapshot) => {
      if (
        snapshot.demo || !snapshot.focus || !snapshot.open ||
        !snapshot.element
      ) return;

      queueMicrotask(() => {
        if (context.machine.state.popoverState !== PopoverStates.Open) return;
        const activeElement = getActiveElement(snapshot.element);
        if (snapshot.element?.contains(activeElement)) return;
        focusIn(snapshot.element!, Focus.First);
      });
    },
  );

  createEffect(
    () => ({
      open: open(),
      static: Boolean(props.static),
      unmount: props.unmount ?? true,
    }),
    (snapshot) => {
      if (snapshot.static || snapshot.open || !snapshot.unmount) return;
      context.machine.actions.setPanel(null);
    },
  );

  createOnDisappear(
    visible,
    () => context.machine.state.button,
    context.machine.actions.close,
  );
  const ownerDocument = () =>
    getOwnerDocument(element() ?? context.machine.state.button);
  const modalEnabled = () =>
    !context.state().__demoMode && modal() && visible();
  createScrollLock(
    modalEnabled,
    ownerDocument,
    () =>
      [context.machine.state.button, context.machine.state.panel].filter(
        (node): node is HTMLElement => node !== null,
      ),
  );

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (context.machine.state.popoverState !== PopoverStates.Open) return;
    if (!elementSnapshot) return;
    const activeElement = getActiveElement(elementSnapshot);
    if (activeElement && !elementSnapshot.contains(activeElement)) return;
    event.preventDefault();
    event.stopPropagation();
    flush(() => context.machine.actions.close());
    context.machine.state.button?.focus({ preventScroll: true });
  };

  const handleBlur = (event: FocusEvent): void => {
    if (!focus() || context.machine.state.popoverState !== PopoverStates.Open) {
      return;
    }
    if (!DOM.isHTMLElement(event.relatedTarget) || !elementSnapshot) return;
    if (elementSnapshot.contains(event.relatedTarget)) return;

    context.machine.actions.close();
    if (
      context.machine.state.beforePanelSentinel.current?.contains(
        event.relatedTarget,
      ) ||
      context.machine.state.afterPanelSentinel.current?.contains(
        event.relatedTarget,
      )
    ) {
      event.relatedTarget.focus({ preventScroll: true });
    }
  };

  const direction = createTabDirection(() =>
    context.machine.state.button?.ownerDocument.defaultView ??
      (typeof window === "undefined" ? null : window)
  );
  const handleBeforeFocus = (): void => {
    const panel = elementSnapshot;
    if (!panel) return;

    queueMicrotask(() => {
      if (direction() === TabDirection.Backwards) {
        context.machine.state.button?.focus({ preventScroll: true });
        return;
      }
      if (focusIn(panel, Focus.First) === FocusResult.Error) {
        context.machine.state.afterPanelSentinel.current?.focus();
      }
    });
  };

  const handleAfterFocus = (): void => {
    const panel = elementSnapshot;
    if (!panel) return;

    queueMicrotask(() => {
      if (direction() === TabDirection.Backwards) {
        if (focusIn(panel, Focus.Previous) === FocusResult.Error) {
          context.machine.state.button?.focus();
        }
        return;
      }
      const button = context.machine.state.button;
      if (!button) return;
      const root = getRootNode(button) ?? button.ownerDocument.body;
      const elements = getFocusableElements(root);
      const buttonIndex = elements.indexOf(button);
      const combined = [
        ...elements.slice(buttonIndex + 1),
        ...elements.slice(0, buttonIndex + 1),
      ].filter((candidate) =>
        candidate.dataset.headlessuiFocusGuard !== "true" &&
        !panel.contains(candidate)
      );
      focusIn(combined, Focus.First, { sorted: false });
    });
  };

  onSettled(() => {
    setReady(true);
    return () => {
      if (context.machine.state.panel === elementSnapshot) {
        context.machine.actions.setPanel(null);
      }
    };
  });

  const slot: PopoverPanelRenderPropArg = {
    close: context.machine.actions.refocusableClose,
    get open() {
      return open();
    },
  };
  const theirProps = mergeEventProps(
    omit(
      props as AnyProps,
      "anchor",
      "focus",
      "id",
      "modal",
      "portal",
      "ref",
      "style",
      "transition",
    ),
    {
      get style(): JSX.CSSProperties | string | undefined {
        return mergeStyle(props.style, {
          ...floatingStyles(),
          "--button-width": buttonSize.width,
        }) as JSX.CSSProperties | string | undefined;
      },
    },
  );
  const ourProps = mergeEventProps(floatingPanelProps, {
    get ref(): Ref<HTMLElement> {
      return [
        props.ref as Ref<HTMLElement>,
        floatingRef,
        setPanelElement,
      ];
    },
    get id() {
      return id();
    },
    tabindex: -1,
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
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
  });

  return (
    <ResetOpenClosedProvider>
      <PopoverPanelContext value={id()}>
        <CloseProvider value={context.machine.actions.refocusableClose}>
          <Portal
            enabled={portalEnabled() && (Boolean(props.static) || visible())}
            ownerDocument={getOwnerDocument(context.machine.state.button)}
          >
            <Show when={visible() && isPortalled()}>
              <FocusSentinel
                id={beforeSentinelId}
                sentinel={context.machine.state.beforePanelSentinel}
                onFocus={handleBeforeFocus}
              />
            </Show>
            {renderElement({
              defaultTag: DEFAULT_PANEL_TAG,
              features: PANEL_RENDER_FEATURES,
              name: "Popover.Panel",
              ourProps,
              slot,
              stateKeys: ["open"],
              theirProps,
              visible,
            })}
            <Show when={visible() && isPortalled()}>
              <FocusSentinel
                id={afterSentinelId}
                sentinel={context.machine.state.afterPanelSentinel}
                onFocus={handleAfterFocus}
              />
            </Show>
          </Portal>
        </CloseProvider>
      </PopoverPanelContext>
    </ResetOpenClosedProvider>
  );
}

const DEFAULT_GROUP_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the popover group component.
 */
export type PopoverGroupRenderPropArg = Record<never, never>;

/**
 * Props accepted by the popover group component.
 */
export type PopoverGroupProps<
  TTag extends ValidComponent = typeof DEFAULT_GROUP_TAG,
> = Props<
  TTag,
  PopoverGroupRenderPropArg,
  never,
  Record<never, never>,
  HTMLElement
>;

/**
 * Renders the group for the popover component family.
 */
export function PopoverGroup<
  TTag extends ValidComponent = typeof DEFAULT_GROUP_TAG,
>(props: PopoverGroupProps<TTag>): Element {
  let groupElement: HTMLElement | null = null;
  const popovers = new Set<PopoverRegisterBag>();

  const registerPopover = (bag: PopoverRegisterBag): () => void => {
    popovers.add(bag);
    return () => popovers.delete(bag);
  };
  const isFocusWithinPopoverGroup = (): boolean => {
    const root = getRootNode(groupElement);
    if (!root) return false;
    const activeElement = getActiveElement(groupElement);
    if (groupElement?.contains(activeElement)) return true;

    return [...popovers].some((bag) => {
      const buttonId = bag.buttonId.current;
      const panelId = bag.panelId.current;
      return Boolean(
        (buttonId && root.getElementById(buttonId)?.contains(activeElement)) ||
          (panelId && root.getElementById(panelId)?.contains(activeElement)),
      );
    });
  };
  const closeOthers = (buttonId: string): void => {
    for (const popover of popovers) {
      if (popover.buttonId.current !== buttonId) popover.close();
    }
  };
  const context: PopoverGroupContextValue = {
    closeOthers,
    isFocusWithinPopoverGroup,
    registerPopover,
  };
  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return [props.ref as Ref<HTMLElement>, (next: HTMLElement | null) => {
        groupElement = next;
      }];
    },
  };

  return (
    <MainTreeProvider>
      <PopoverGroupContext value={context}>
        {renderElement({
          defaultTag: DEFAULT_GROUP_TAG,
          name: "Popover.Group",
          ourProps,
          slot: {},
          theirProps: omit(props as AnyProps, "ref"),
        })}
      </PopoverGroupContext>
    </MainTreeProvider>
  );
}

/**
 * Renders the accessible, unstyled popover component for Solid.
 */
export const Popover: typeof PopoverRoot & {
  Backdrop: typeof PopoverBackdrop;
  Button: typeof PopoverButton;
  Group: typeof PopoverGroup;
  Overlay: typeof PopoverOverlay;
  Panel: typeof PopoverPanel;
} = Object.assign(PopoverRoot, {
  /** @deprecated Use `<PopoverBackdrop>` instead. */
  Backdrop: PopoverBackdrop,
  /** @deprecated Use `<PopoverButton>` instead. */
  Button: PopoverButton,
  /** @deprecated Use `<PopoverGroup>` instead. */
  Group: PopoverGroup,
  /** @deprecated Use `<PopoverOverlay>` instead. */
  Overlay: PopoverOverlay,
  /** @deprecated Use `<PopoverPanel>` instead. */
  Panel: PopoverPanel,
});
