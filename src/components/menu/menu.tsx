// WAI-ARIA: https://www.w3.org/WAI/ARIA/apg/patterns/menubutton/
import {
  type Accessor,
  type Component,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  type Element,
  flush,
  omit,
  onSettled,
  untrack,
  useContext,
} from "solid-js";
import type { JSX, ValidComponent } from "@solidjs/web";
import { useDescriptions } from "../description/description.tsx";
import { useLabelContext, useLabels } from "../label/label.tsx";
import { Portal, useNestedPortals } from "../portal/portal.tsx";
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
import {
  OpenClosedProvider,
  OpenClosedState,
} from "../../internal/open-closed.tsx";
import { createInertOthers } from "../../primitives/inert-others.ts";
import { createElementSize } from "../../primitives/element-size.ts";
import {
  createActivePress,
  createFocusRing,
  createHover,
} from "../../primitives/interactions.ts";
import { createOnDisappear } from "../../primitives/on-disappear.ts";
import { createOutsideClick } from "../../primitives/outside-click.ts";
import {
  createQuickRelease,
  QuickReleaseAction,
} from "../../primitives/quick-release.ts";
import { createRootContainers } from "../../primitives/root-containers.tsx";
import { createScrollLock } from "../../primitives/scroll-lock.ts";
import { createEscape, createIsTopLayer } from "../../primitives/top-layer.ts";
import { createTransition } from "../../primitives/transition.ts";
import type { Props, Ref } from "../../types.ts";
import { Focus } from "../../utils/calculate-active-index.ts";
import { disposables } from "../../utils/disposables.ts";
import * as DOM from "../../utils/dom.ts";
import {
  Focus as FocusManagementFocus,
  FocusableMode,
  focusFrom,
  isFocusableElement,
  restoreFocusIfNecessary,
} from "../../utils/focus-management.ts";
import { getTextValue } from "../../utils/get-text-value.ts";
import type { AnyProps } from "../../utils/merge-event-props.ts";
import { getOwnerDocument, isActiveElement } from "../../utils/owner.ts";
import {
  mergeEventProps,
  type PropsForFeatures,
  renderElement,
  RenderFeatures,
} from "../../utils/render.tsx";
import {
  ActivationTrigger,
  type MenuAction,
  MenuActionType,
  type MenuItemDataRef,
  MenuMachine,
  type MenuMachineState,
  MenuState,
} from "./menu-machine.ts";

export { ActivationTrigger, MenuState } from "./menu-machine.ts";

/**
 * Anchor configuration accepted by the menu component family.
 */
export type MenuAnchor = AnchorProps;
/**
 * Placement values accepted by anchored menu content.
 */
export type MenuAnchorTo = AnchorTo;
/**
 * Floating-position configuration for anchored menu content.
 */
export type MenuAnchorConfig = Exclude<AnchorProps, boolean | string>;

const Transparent: Component<{ children?: Element }> = (props) => (
  <>{props.children}</>
);

interface MenuContextValue {
  readonly machine: MenuMachine;
  readonly state: Accessor<Readonly<MenuMachineState>>;
}

const MenuContext = createContext<MenuContextValue>();

function send(context: MenuContextValue, action: MenuAction): void {
  context.machine.send(action);
}

const DEFAULT_MENU_TAG = Transparent;

/**
 * Reactive state exposed to render-prop children of the menu component.
 */
export type MenuRenderPropArg = Readonly<{
  close: () => void;
  open: boolean;
}>;

/**
 * Props accepted by the menu component.
 */
export type MenuProps<
  TTag extends ValidComponent = typeof DEFAULT_MENU_TAG,
> = Props<
  TTag,
  MenuRenderPropArg,
  never,
  { __demoMode?: boolean },
  HTMLElement
>;

function MenuRoot<TTag extends ValidComponent = typeof DEFAULT_MENU_TAG>(
  props: MenuProps<TTag>,
): Element {
  const id = `headlessui-menu-${createUniqueId()}`;
  const machine = MenuMachine.create({
    id,
    __demoMode: untrack(() => Boolean(props.__demoMode)),
  });
  const [state, setState] = createSignal<Readonly<MenuMachineState>>(
    machine.state,
    { name: "menu-state", ownedWrite: true },
  );
  const context: MenuContextValue = { machine, state };
  const [portals, PortalWrapper] = useNestedPortals();
  const open = createMemo(() => state().menuState === MenuState.Open);
  const isTopLayer = createIsTopLayer(open, "menu-outside-click");
  const rootContainers = createRootContainers({
    defaultContainers: () => [
      machine.state.buttonElement,
      machine.state.itemsElement,
    ],
    mainTreeNode: () => machine.state.buttonElement,
    portals,
  });
  const fallbackDocument = typeof document === "undefined" ? null : document;
  const ownerDocument = () =>
    getOwnerDocument(machine.state.buttonElement) ?? fallbackDocument;

  const close = () => machine.send({ type: MenuActionType.CloseMenu });

  createOutsideClick(
    () => open() && isTopLayer(),
    () => untrack(rootContainers.resolveContainers),
    (event, target) => {
      close();
      if (!isFocusableElement(target, FocusableMode.Loose)) {
        event.preventDefault();
        machine.state.buttonElement?.focus({ preventScroll: true });
      }
    },
    ownerDocument,
  );

  createEscape(
    open,
    () => ownerDocument()?.defaultView ?? null,
    (event) => {
      event.preventDefault();
      close();
      machine.state.buttonElement?.focus({ preventScroll: true });
    },
  );

  // Child refs publish machine snapshots while the tree is being constructed.
  // Subscribe once hydration has claimed that tree so those writes cannot
  // replay an owner before its DOM claims are complete.
  onSettled(() => {
    const unsubscribe = machine.subscribe((current) => current, setState);
    setState(machine.state);
    return () => {
      unsubscribe();
      machine.dispose();
    };
  });

  const slot: MenuRenderPropArg = {
    close,
    get open() {
      return open();
    },
  };
  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return props.ref as Ref<HTMLElement>;
    },
  };

  return (
    <FloatingProvider>
      <MenuContext value={context}>
        <OpenClosedProvider
          value={() => open() ? OpenClosedState.Open : OpenClosedState.Closed}
        >
          <PortalWrapper>
            {renderElement({
              defaultTag: DEFAULT_MENU_TAG,
              name: "Menu",
              ourProps,
              slot,
              stateKeys: ["open"],
              theirProps: omit(props as AnyProps, "__demoMode", "ref"),
            })}
          </PortalWrapper>
        </OpenClosedProvider>
      </MenuContext>
    </FloatingProvider>
  );
}

const DEFAULT_BUTTON_TAG = "button" as const;

/**
 * Reactive state exposed to render-prop children of the menu button component.
 */
export type MenuButtonRenderPropArg = Readonly<{
  active: boolean;
  autofocus: boolean;
  disabled: boolean;
  focus: boolean;
  hover: boolean;
  open: boolean;
}>;

type MenuButtonPropsWeControl =
  | "aria-controls"
  | "aria-expanded"
  | "aria-haspopup";

/**
 * Props accepted by the menu button component.
 */
export type MenuButtonProps<
  TTag extends ValidComponent = typeof DEFAULT_BUTTON_TAG,
> = Props<
  TTag,
  MenuButtonRenderPropArg,
  MenuButtonPropsWeControl,
  {
    autofocus?: boolean;
    disabled?: boolean;
    type?: "button" | "reset" | "submit";
  },
  HTMLElement
>;

/**
 * Renders the button for the menu component family.
 */
export function MenuButton<
  TTag extends ValidComponent = typeof DEFAULT_BUTTON_TAG,
>(props: MenuButtonProps<TTag>): Element {
  const context = useContext(MenuContext);
  const generatedId = `headlessui-menu-button-${createUniqueId()}`;
  const [element, setElement] = createSignal<HTMLElement | null>(null, {
    name: "menu-button-element",
    ownedWrite: true,
  });
  const id = () => props.id ?? generatedId;
  const disabled = () => Boolean(props.disabled);
  const autofocus = () => Boolean(props.autofocus);
  const floatingReference = useFloatingReference();
  const floatingReferenceProps = useFloatingReferenceProps();
  const open = () => context.state().menuState === MenuState.Open;
  let pointerType: string | null = null;

  const setButtonElement = (next: HTMLElement | null) => {
    setElement(next);
    send(context, {
      element: next,
      type: MenuActionType.SetButtonElement,
    });
  };

  const startQuickRelease = createQuickRelease(open, {
    action: (event) => {
      const button = context.machine.state.buttonElement;
      if (button?.contains(event.target)) return QuickReleaseAction.Ignore;

      const item = event.target.closest(
        '[role="menuitem"]:not([data-disabled])',
      );
      if (DOM.isHTMLElement(item)) return QuickReleaseAction.Select(item);

      if (context.machine.state.itemsElement?.contains(event.target)) {
        return QuickReleaseAction.Ignore;
      }
      return QuickReleaseAction.Close;
    },
    close: () => send(context, { type: MenuActionType.CloseMenu }),
    owner: () => getOwnerDocument(context.machine.state.buttonElement),
    select: (target) => target.click(),
    trigger: () => context.machine.state.buttonElement,
  });

  createEffect(
    () => ({ element: element(), explicitType: props.type }),
    (snapshot) => {
      if (
        snapshot.explicitType !== undefined ||
        snapshot.element?.tagName !== "BUTTON" ||
        snapshot.element.hasAttribute("type")
      ) return;

      // A Solid custom component consumes its props before its ref can reveal
      // the resolved DOM tag. Setting the ref signal does not re-run that
      // component body, so apply the safe button default once the concrete
      // element is known.
      snapshot.element.setAttribute("type", "button");
    },
  );

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (disabled()) return;
    if (
      event.key === " " || event.key === "Enter" ||
      event.key === "ArrowDown"
    ) {
      event.preventDefault();
      event.stopPropagation();
      send(context, {
        focus: { focus: Focus.First },
        type: MenuActionType.OpenMenu,
      });
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      send(context, {
        focus: { focus: Focus.Last },
        type: MenuActionType.OpenMenu,
      });
    }
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    if (event.key === " ") event.preventDefault();
  };

  const toggle = (event: Event): void => {
    if (open()) {
      flush(() => send(context, { type: MenuActionType.CloseMenu }));
      element()?.focus({ preventScroll: true });
    } else {
      event.preventDefault();
      send(context, {
        focus: { focus: Focus.Nothing },
        trigger: ActivationTrigger.Pointer,
        type: MenuActionType.OpenMenu,
      });
    }
  };
  const handlePointerDown = (event: PointerEvent): void => {
    pointerType = event.pointerType;
    if (disabled() || event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }
    startQuickRelease(event);
    event.preventDefault();
    toggle(event);
  };
  const handleClick = (event: MouseEvent): void => {
    if (disabled()) {
      event.preventDefault();
      return;
    }
    if (pointerType === "mouse") return;
    toggle(event);
  };

  const focusRing = createFocusRing({ disabled, focusVisibleOnly: true });
  const hover = createHover({ disabled });
  const activePress = createActivePress({ disabled });
  const slot: MenuButtonRenderPropArg = {
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
  const ourProps = mergeEventProps(
    floatingReferenceProps,
    {
      get ref(): Ref<HTMLElement> {
        return [
          props.ref as Ref<HTMLElement>,
          floatingReference,
          setButtonElement,
        ];
      },
      get id() {
        return id();
      },
      get type() {
        if (props.type) return props.type;
        const tag = props.as ?? DEFAULT_BUTTON_TAG;
        if (typeof tag === "string" && tag.toLowerCase() === "button") {
          return "button";
        }
        return undefined;
      },
      "aria-haspopup": "menu",
      get "aria-controls"() {
        return context.state().itemsElement?.id;
      },
      get "aria-expanded"() {
        return open() ? "true" : "false";
      },
      get disabled() {
        return disabled() || undefined;
      },
      get autofocus() {
        return autofocus() || undefined;
      },
      get "data-autofocus"() {
        return autofocus() ? "" : undefined;
      },
      onKeyDown: handleKeyDown,
      onKeyUp: handleKeyUp,
      onPointerDown: handlePointerDown,
      onClick: handleClick,
    },
    focusRing.focusProps,
    hover.hoverProps,
    activePress.pressProps,
  );

  return renderElement({
    defaultTag: DEFAULT_BUTTON_TAG,
    name: "Menu.Button",
    ourProps,
    slot,
    stateKeys: [
      "active",
      "autofocus",
      "disabled",
      "focus",
      "hover",
      "open",
    ],
    theirProps,
  });
}

const DEFAULT_ITEMS_TAG = "div" as const;
const ITEMS_RENDER_FEATURES = RenderFeatures.RenderStrategy |
  RenderFeatures.Static;

/**
 * Reactive state exposed to render-prop children of the menu items component.
 */
export type MenuItemsRenderPropArg = Readonly<{ open: boolean }>;

type MenuItemsPropsWeControl =
  | "aria-activedescendant"
  | "aria-labelledby"
  | "role"
  | "tabindex";

type MenuItemsOverrides =
  & PropsForFeatures<typeof ITEMS_RENDER_FEATURES>
  & {
    anchor?: MenuAnchor;
    modal?: boolean;
    portal?: boolean;
    transition?: boolean;
  };

/**
 * Props accepted by the menu items component.
 */
export type MenuItemsProps<
  TTag extends ValidComponent = typeof DEFAULT_ITEMS_TAG,
> = Props<
  TTag,
  MenuItemsRenderPropArg,
  MenuItemsPropsWeControl,
  MenuItemsOverrides,
  HTMLElement
>;

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

function walkMenuTree(container: HTMLElement): void {
  const view = container.ownerDocument.defaultView;
  const showElement = view?.NodeFilter.SHOW_ELEMENT ?? 1;
  const accept = view?.NodeFilter.FILTER_ACCEPT ?? 1;
  const reject = view?.NodeFilter.FILTER_REJECT ?? 2;
  const skip = view?.NodeFilter.FILTER_SKIP ?? 3;
  const walker = container.ownerDocument.createTreeWalker(
    container,
    showElement,
    {
      acceptNode(node) {
        if (!DOM.isHTMLElement(node)) return skip;
        if (node.getAttribute("role") === "menuitem") return reject;
        return node.hasAttribute("role") ? skip : accept;
      },
    },
  );
  while (walker.nextNode()) {
    if (DOM.isHTMLElement(walker.currentNode)) {
      walker.currentNode.setAttribute("role", "none");
    }
  }
}

/**
 * Renders the items for the menu component family.
 */
export function MenuItems<
  TTag extends ValidComponent = typeof DEFAULT_ITEMS_TAG,
>(props: MenuItemsProps<TTag>): Element {
  const context = useContext(MenuContext);
  const generatedId = `headlessui-menu-items-${createUniqueId()}`;
  const [element, setElement] = createSignal<HTMLElement | null>(null, {
    name: "menu-items-element",
    ownedWrite: true,
  });
  const [visible, setVisible] = createSignal(
    untrack(() => context.state().menuState === MenuState.Open),
    { name: "menu-items-visible", ownedWrite: true },
  );
  const [initial, setInitial] = createSignal(true, {
    name: "menu-items-initial",
    ownedWrite: true,
  });
  const [ready, setReady] = createSignal(false, {
    name: "menu-items-ready",
    ownedWrite: true,
  });
  const id = () => props.id ?? generatedId;
  const open = () => context.state().menuState === MenuState.Open;
  const transitionEnabled = () => Boolean(props.transition);
  const anchor = useResolvedAnchor(() => props.anchor);
  const portalEnabled = () => Boolean(props.portal) || anchor() !== null;
  const modal = () => props.modal ?? true;
  const didButtonMove = () =>
    context.machine.selectors.didButtonMove(
      context.state() as MenuMachineState,
    );
  const panelEnabled = () => visible() && !didButtonMove();
  const [floatingRef, floatingStyles] = useFloatingPanel(anchor);
  const floatingPanelProps = useFloatingPanelProps();
  const buttonSize = createElementSize(
    panelEnabled,
    () => context.state().buttonElement,
    true,
  );

  const setItemsElement = (next: HTMLElement | null) => {
    setElement(next);
    send(context, {
      element: next,
      type: MenuActionType.SetItemsElement,
    });
  };

  createEffect(
    () => ({ open: open(), transition: transitionEnabled() }),
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
    show: open,
    end(nextOpen) {
      if (!nextOpen) setVisible(false);
    },
  });

  createEffect(
    () => ({ element: element(), open: open() }),
    (snapshot) => {
      if (!snapshot.open || !snapshot.element) return;
      queueMicrotask(() => {
        if (context.machine.state.menuState !== MenuState.Open) return;
        if (
          !snapshot.element?.isConnected || isActiveElement(snapshot.element)
        ) {
          return;
        }
        snapshot.element.focus({ preventScroll: true });
      });
    },
  );

  createEffect(
    () => ({ element: element(), open: open() }),
    (snapshot) => {
      if (!snapshot.open || !snapshot.element) return;
      const cleanup = disposables();
      const update = () => walkMenuTree(snapshot.element!);
      update();
      if (typeof MutationObserver !== "undefined") {
        const observer = new MutationObserver(update);
        observer.observe(snapshot.element, { childList: true, subtree: true });
        cleanup.add(() => observer.disconnect());
      }
      return cleanup.dispose;
    },
  );

  createOnDisappear(panelEnabled, () => context.state().buttonElement, () => {
    send(context, { type: MenuActionType.CloseMenu });
  });

  const ownerDocument = () =>
    getOwnerDocument(element() ?? context.state().buttonElement);
  const modalEnabled = () => !context.state().__demoMode && modal() && open();
  createScrollLock(
    modalEnabled,
    ownerDocument,
    () =>
      [context.state().buttonElement, element()].filter(
        (node): node is HTMLElement => node !== null,
      ),
  );
  createInertOthers(modalEnabled, {
    allowed: () => [context.state().buttonElement, element()],
  });

  const searchCleanup = disposables();
  const handleKeyDown = (event: KeyboardEvent): void => {
    searchCleanup.dispose();

    if (event.key === " " && context.machine.state.searchQuery !== "") {
      event.preventDefault();
      event.stopPropagation();
      send(context, { type: MenuActionType.Search, value: event.key });
      return;
    }

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const current = context.machine.state;
      if (current.activeItemIndex !== null) {
        current.items[current.activeItemIndex]?.dataRef.current.domRef.current
          ?.click();
      }
      send(context, { type: MenuActionType.CloseMenu });
      restoreFocusIfNecessary(context.machine.state.buttonElement);
      return;
    }

    const navigation = event.key === "ArrowDown"
      ? Focus.Next
      : event.key === "ArrowUp"
      ? Focus.Previous
      : event.key === "Home" || event.key === "PageUp"
      ? Focus.First
      : event.key === "End" || event.key === "PageDown"
      ? Focus.Last
      : null;
    if (navigation !== null) {
      event.preventDefault();
      event.stopPropagation();
      send(context, {
        focus: navigation,
        type: MenuActionType.GoToItem,
      });
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      flush(() => send(context, { type: MenuActionType.CloseMenu }));
      context.machine.state.buttonElement?.focus({ preventScroll: true });
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      const button = context.machine.state.buttonElement;
      flush(() => send(context, { type: MenuActionType.CloseMenu }));
      focusFrom(
        button,
        event.shiftKey
          ? FocusManagementFocus.Previous
          : FocusManagementFocus.Next,
      );
      return;
    }

    if (event.key.length === 1) {
      send(context, { type: MenuActionType.Search, value: event.key });
      searchCleanup.setTimeout(
        () => send(context, { type: MenuActionType.ClearSearch }),
        350,
      );
    }
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    if (event.key === " ") event.preventDefault();
  };

  onSettled(() => {
    setReady(true);
    return () => searchCleanup.dispose();
  });

  const slot: MenuItemsRenderPropArg = {
    get open() {
      return open();
    },
  };
  const theirProps = mergeEventProps(
    omit(
      props as AnyProps,
      "anchor",
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
  const ourProps: AnyProps = mergeEventProps(floatingPanelProps, {
    get ref(): Ref<HTMLElement> {
      return [
        props.ref as Ref<HTMLElement>,
        floatingRef,
        setItemsElement,
      ];
    },
    get id() {
      return id();
    },
    role: "menu",
    get tabindex() {
      return open() ? 0 : undefined;
    },
    get "aria-activedescendant"() {
      return context.machine.selectors.activeDescendantId(
        context.state() as MenuMachineState,
      );
    },
    get "aria-labelledby"() {
      return context.state().buttonElement?.id;
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
    onKeyDown: handleKeyDown,
    onKeyUp: handleKeyUp,
  });

  return (
    <Portal
      enabled={portalEnabled()}
      ownerDocument={ownerDocument()}
    >
      {renderElement({
        defaultTag: DEFAULT_ITEMS_TAG,
        features: ITEMS_RENDER_FEATURES,
        name: "Menu.Items",
        ourProps,
        slot,
        stateKeys: ["open"],
        theirProps,
        visible: panelEnabled,
      })}
    </Portal>
  );
}

const DEFAULT_ITEM_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the menu item component.
 */
export type MenuItemRenderPropArg = Readonly<{
  /** @deprecated Use `focus` instead. */
  active: boolean;
  close: () => void;
  disabled: boolean;
  focus: boolean;
}>;

type MenuItemPropsWeControl =
  | "aria-describedby"
  | "aria-disabled"
  | "aria-labelledby"
  | "role"
  | "tabindex";

/**
 * Props accepted by the menu item component.
 */
export type MenuItemProps<
  TTag extends ValidComponent = typeof DEFAULT_ITEM_TAG,
> = Props<
  TTag,
  MenuItemRenderPropArg,
  MenuItemPropsWeControl,
  { disabled?: boolean },
  HTMLElement
>;

/**
 * Renders the item for the menu component family.
 */
export function MenuItem<
  TTag extends ValidComponent = typeof DEFAULT_ITEM_TAG,
>(props: MenuItemProps<TTag>): Element {
  const context = useContext(MenuContext);
  const generatedId = `headlessui-menu-item-${createUniqueId()}`;
  const id = () => props.id ?? generatedId;
  const disabled = () => Boolean(props.disabled);
  const elementRef = { current: null as HTMLElement | null };
  const dataRef: MenuItemDataRef = {
    current: {
      disabled: untrack(disabled),
      domRef: elementRef,
      get textValue() {
        return elementRef.current
          ? getTextValue(elementRef.current).toLowerCase()
          : "";
      },
    },
  };
  const active = () =>
    context.machine.selectors.isActive(
      context.state() as MenuMachineState,
      id(),
    );
  const shouldScrollIntoView = () =>
    context.machine.selectors.shouldScrollIntoView(
      context.state() as MenuMachineState,
      id(),
    );

  createEffect(disabled, (value) => {
    dataRef.current.disabled = value;
  });
  createEffect(shouldScrollIntoView, (shouldScroll) => {
    if (!shouldScroll) return;
    const cleanup = disposables();
    cleanup.requestAnimationFrame(() => {
      elementRef.current?.scrollIntoView?.({ block: "nearest" });
    });
    return cleanup.dispose;
  });

  let registeredId: string | null = null;
  createEffect(
    id,
    (nextId) => {
      if (registeredId === null || registeredId === nextId) return;
      const previousId = registeredId;
      registeredId = nextId;
      context.machine.actions.unregisterItem(previousId);
      context.machine.actions.registerItem(nextId, dataRef);
    },
    { defer: true },
  );
  onSettled(() => {
    const initialId = id();
    registeredId = initialId;
    context.machine.actions.registerItem(initialId, dataRef);
    return () => {
      const currentId = registeredId;
      registeredId = null;
      if (currentId !== null) {
        context.machine.actions.unregisterItem(currentId);
      }
    };
  });

  const close = () => send(context, { type: MenuActionType.CloseMenu });
  const handleClick = (event: MouseEvent): void => {
    if (disabled()) {
      event.preventDefault();
      return;
    }
    close();
    restoreFocusIfNecessary(context.machine.state.buttonElement);
  };
  const handleFocus = (): void => {
    if (disabled()) {
      send(context, {
        focus: Focus.Nothing,
        type: MenuActionType.GoToItem,
      });
    } else {
      send(context, {
        focus: Focus.Specific,
        id: id(),
        type: MenuActionType.GoToItem,
      });
    }
  };

  let pointer = { x: Number.NaN, y: Number.NaN };
  const moved = (event: MouseEvent | PointerEvent): boolean => {
    const next = { x: event.clientX, y: event.clientY };
    const changed = pointer.x !== next.x || pointer.y !== next.y;
    pointer = next;
    return changed;
  };
  const handleEnter = (event: MouseEvent | PointerEvent): void => {
    pointer = { x: event.clientX, y: event.clientY };
  };
  const handleMove = (event: MouseEvent | PointerEvent): void => {
    if (!moved(event) || disabled() || active()) return;
    send(context, {
      focus: Focus.Specific,
      id: id(),
      trigger: ActivationTrigger.Pointer,
      type: MenuActionType.GoToItem,
    });
  };
  const handleLeave = (event: MouseEvent | PointerEvent): void => {
    if (!moved(event) || disabled() || !active()) return;
    if (
      context.machine.state.activationTrigger !== ActivationTrigger.Pointer
    ) return;
    send(context, {
      focus: Focus.Nothing,
      type: MenuActionType.GoToItem,
    });
  };

  const [labelledBy, LabelProvider] = useLabels();
  const [describedBy, DescriptionProvider] = useDescriptions();
  const slot: MenuItemRenderPropArg = {
    get active() {
      return active();
    },
    close,
    get disabled() {
      return disabled();
    },
    get focus() {
      return active();
    },
  };
  const theirProps = omit(
    props as AnyProps,
    "disabled",
    "id",
    "ref",
  );
  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return [props.ref as Ref<HTMLElement>, (element: HTMLElement) => {
        elementRef.current = element;
      }];
    },
    get id() {
      return id();
    },
    role: "menuitem",
    get tabindex() {
      return disabled() ? undefined : -1;
    },
    get "aria-disabled"() {
      return disabled() ? "true" : undefined;
    },
    get "aria-labelledby"() {
      return labelledBy();
    },
    get "aria-describedby"() {
      return describedBy();
    },
    onClick: handleClick,
    onFocus: handleFocus,
    onPointerEnter: handleEnter,
    onMouseEnter: handleEnter,
    onPointerMove: handleMove,
    onMouseMove: handleMove,
    onPointerLeave: handleLeave,
    onMouseLeave: handleLeave,
  };

  return (
    <LabelProvider name="Menu.Label">
      <DescriptionProvider name="Menu.Description">
        {renderElement({
          defaultTag: DEFAULT_ITEM_TAG,
          name: "Menu.Item",
          ourProps,
          slot,
          stateKeys: ["active", "disabled", "focus"],
          theirProps,
        })}
      </DescriptionProvider>
    </LabelProvider>
  );
}

const DEFAULT_SECTION_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the menu section component.
 */
export type MenuSectionRenderPropArg = Record<never, never>;
type MenuSectionPropsWeControl = "aria-labelledby" | "role";

/**
 * Props accepted by the menu section component.
 */
export type MenuSectionProps<
  TTag extends ValidComponent = typeof DEFAULT_SECTION_TAG,
> = Props<
  TTag,
  MenuSectionRenderPropArg,
  MenuSectionPropsWeControl,
  Record<never, never>,
  HTMLElement
>;

/**
 * Renders the section for the menu component family.
 */
export function MenuSection<
  TTag extends ValidComponent = typeof DEFAULT_SECTION_TAG,
>(props: MenuSectionProps<TTag>): Element {
  const [labelledBy, LabelProvider] = useLabels();
  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return props.ref as Ref<HTMLElement>;
    },
    role: "group",
    get "aria-labelledby"() {
      return labelledBy();
    },
  };
  return (
    <LabelProvider name="Menu.Heading">
      {renderElement({
        defaultTag: DEFAULT_SECTION_TAG,
        name: "Menu.Section",
        ourProps,
        slot: {},
        theirProps: omit(props as AnyProps, "ref"),
      })}
    </LabelProvider>
  );
}

const DEFAULT_HEADING_TAG = "header" as const;

/**
 * Reactive state exposed to render-prop children of the menu heading component.
 */
export type MenuHeadingRenderPropArg = Record<never, never>;
type MenuHeadingPropsWeControl = "role";

/**
 * Props accepted by the menu heading component.
 */
export type MenuHeadingProps<
  TTag extends ValidComponent = typeof DEFAULT_HEADING_TAG,
> = Props<
  TTag,
  MenuHeadingRenderPropArg,
  MenuHeadingPropsWeControl,
  Record<never, never>,
  HTMLElement
>;

/**
 * Renders the heading for the menu component family.
 */
export function MenuHeading<
  TTag extends ValidComponent = typeof DEFAULT_HEADING_TAG,
>(props: MenuHeadingProps<TTag>): Element {
  const context = useLabelContext();
  const generatedId = `headlessui-menu-heading-${createUniqueId()}`;
  const id = () => props.id ?? generatedId;
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

  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return props.ref as Ref<HTMLElement>;
    },
    get id() {
      return id();
    },
    role: "presentation",
  };
  return renderElement({
    defaultTag: DEFAULT_HEADING_TAG,
    name: "Menu.Heading",
    ourProps,
    slot: {},
    theirProps: omit(props as AnyProps, "id", "ref"),
  });
}

const DEFAULT_SEPARATOR_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the menu separator component.
 */
export type MenuSeparatorRenderPropArg = Record<never, never>;
type MenuSeparatorPropsWeControl = "role";

/**
 * Props accepted by the menu separator component.
 */
export type MenuSeparatorProps<
  TTag extends ValidComponent = typeof DEFAULT_SEPARATOR_TAG,
> = Props<
  TTag,
  MenuSeparatorRenderPropArg,
  MenuSeparatorPropsWeControl,
  Record<never, never>,
  HTMLElement
>;

/**
 * Renders the separator for the menu component family.
 */
export function MenuSeparator<
  TTag extends ValidComponent = typeof DEFAULT_SEPARATOR_TAG,
>(props: MenuSeparatorProps<TTag>): Element {
  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return props.ref as Ref<HTMLElement>;
    },
    role: "separator",
  };
  return renderElement({
    defaultTag: DEFAULT_SEPARATOR_TAG,
    name: "Menu.Separator",
    ourProps,
    slot: {},
    theirProps: omit(props as AnyProps, "ref"),
  });
}

/**
 * Renders the accessible, unstyled menu component for Solid.
 */
export const Menu: typeof MenuRoot & {
  Button: typeof MenuButton;
  Heading: typeof MenuHeading;
  Item: typeof MenuItem;
  Items: typeof MenuItems;
  Section: typeof MenuSection;
  Separator: typeof MenuSeparator;
} = Object.assign(MenuRoot, {
  /** @deprecated Use `<MenuButton>` instead. */
  Button: MenuButton,
  /** @deprecated Use `<MenuHeading>` instead. */
  Heading: MenuHeading,
  /** @deprecated Use `<MenuItem>` instead. */
  Item: MenuItem,
  /** @deprecated Use `<MenuItems>` instead. */
  Items: MenuItems,
  /** @deprecated Use `<MenuSection>` instead. */
  Section: MenuSection,
  /** @deprecated Use `<MenuSeparator>` instead. */
  Separator: MenuSeparator,
});
