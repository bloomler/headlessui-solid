// WAI-ARIA: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
import {
  type Accessor,
  children as resolveChildren,
  type Component,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  type Element,
  omit,
  onSettled,
  Show,
  untrack,
  useContext,
} from "solid-js";
import { dynamic, type JSX, type ValidComponent } from "@solidjs/web";
import {
  Description,
  type DescriptionProps,
  useDescriptions,
} from "../description/description.tsx";
import {
  FocusTrap,
  type FocusTrapElementReference,
  FocusTrapFeatures,
} from "../focus-trap/focus-trap.tsx";
import { Portal, PortalGroup, useNestedPortals } from "../portal/portal.tsx";
import {
  Transition,
  TransitionChild,
  type TransitionClasses,
  type TransitionEvents,
} from "../transition/transition.tsx";
import { CloseProvider } from "../../internal/close-provider.tsx";
import {
  OpenClosedState,
  ResetOpenClosedProvider,
  useOpenClosed,
} from "../../internal/open-closed.tsx";
import { ForcePortalRoot } from "../../internal/portal-force-root.tsx";
import { createInertOthers } from "../../primitives/inert-others.ts";
import { createOnDisappear } from "../../primitives/on-disappear.ts";
import { createOutsideClick } from "../../primitives/outside-click.ts";
import {
  createRootContainers,
  MainTreeProvider,
  useMainTreeNode,
} from "../../primitives/root-containers.tsx";
import { createScrollLock } from "../../primitives/scroll-lock.ts";
import { createEscape, createIsTopLayer } from "../../primitives/top-layer.ts";
import type { Props, Ref } from "../../types.ts";
import * as DOM from "../../utils/dom.ts";
import type { AnyProps } from "../../utils/merge-event-props.ts";
import { mergeEventProps } from "../../utils/merge-event-props.ts";
import { getOwnerDocument } from "../../utils/owner.ts";
import type { PropsForFeatures } from "../../utils/render.tsx";
import { RenderFeatures } from "../../utils/render.tsx";

const Transparent: Component<AnyProps> = (props) => (
  <>{props.children as Element}</>
);
const FocusTrapComponent = FocusTrap as Component<AnyProps>;
const TransitionChildComponent = TransitionChild as Component<AnyProps>;

const DIALOG_RENDER_FEATURES = RenderFeatures.RenderStrategy |
  RenderFeatures.Static;

type DialogRole = "dialog" | "alertdialog";

interface DialogContextValue {
  close: () => void;
  open: Accessor<boolean>;
  panelElement: Accessor<HTMLElement | null>;
  registerTitle: (id: string) => () => void;
  setPanelElement: (element: HTMLElement | null) => void;
  titleId: Accessor<string | undefined>;
  unmount: Accessor<boolean>;
}

const DialogContext = createContext<DialogContextValue>();

function hasOwn(source: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function assignRef<T>(reference: Ref<T> | undefined, value: T): void {
  if (typeof reference === "function") {
    (reference as (element: T) => void)(value);
    return;
  }

  if (!Array.isArray(reference)) return;
  for (const nested of reference) assignRef(nested as Ref<T>, value);
}

function createIsTouchDevice(
  ownerWindow: Accessor<Window | null>,
): Accessor<boolean> {
  const [touch, setTouch] = createSignal(false, { ownedWrite: true });

  createEffect(ownerWindow, (view) => {
    if (!view || typeof view.matchMedia !== "function") {
      setTouch(false);
      return;
    }

    const query = view.matchMedia("(pointer: coarse)");
    setTouch(query.matches);
    const update = (event: MediaQueryListEvent) => setTouch(event.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  });

  return touch;
}

function resolvedStyle(
  style: JSX.CSSProperties | string | undefined,
  hidden: boolean,
): JSX.CSSProperties | string | undefined {
  return hidden ? { display: "none" } : style;
}

function resolvedChildren<TSlot extends object>(
  children: Element | ((slot: TSlot) => Element) | undefined,
  slot: TSlot,
): Element {
  return typeof children === "function" && children.length > 0
    ? (children as (slot: TSlot) => Element)(slot)
    : children as Element;
}

function resolvedClass<TSlot extends object>(
  value: JSX.ClassValue | ((slot: TSlot) => JSX.ClassValue) | undefined,
  slot: TSlot,
): JSX.ClassValue {
  return typeof value === "function"
    ? (value as (slot: TSlot) => JSX.ClassValue)(slot)
    : value;
}

function transitionProps(source: TransitionClasses & TransitionEvents) {
  return {
    get afterEnter() {
      return source.afterEnter;
    },
    get afterLeave() {
      return source.afterLeave;
    },
    get beforeEnter() {
      return source.beforeEnter;
    },
    get beforeLeave() {
      return source.beforeLeave;
    },
    get enter() {
      return source.enter;
    },
    get entered() {
      return source.entered;
    },
    get enterFrom() {
      return source.enterFrom;
    },
    get enterTo() {
      return source.enterTo;
    },
    get leave() {
      return source.leave;
    },
    get leaveFrom() {
      return source.leaveFrom;
    },
    get leaveTo() {
      return source.leaveTo;
    },
  };
}

const DEFAULT_DIALOG_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the dialog component.
 */
export type DialogRenderPropArg = Readonly<{ open: boolean }>;

type DialogPropsWeControl =
  | "aria-describedby"
  | "aria-labelledby"
  | "aria-modal";

type DialogOverrides =
  & PropsForFeatures<typeof DIALOG_RENDER_FEATURES>
  & TransitionClasses
  & TransitionEvents
  & {
    /** Prefer the Solid-native lowercase spelling. */
    autofocus?: boolean;
    /** @deprecated Use `autofocus` in Solid. */
    autoFocus?: boolean;
    __demoMode?: boolean;
    initialFocus?: FocusTrapElementReference;
    onClose: (value: false) => void;
    open?: boolean;
    role?: DialogRole;
    transition?: boolean;
  };

/**
 * Props accepted by the dialog component.
 */
export type DialogProps<
  TTag extends ValidComponent = typeof DEFAULT_DIALOG_TAG,
> = Props<
  TTag,
  DialogRenderPropArg,
  DialogPropsWeControl,
  DialogOverrides,
  HTMLElement
>;

type InternalDialogProps<TTag extends ValidComponent> = DialogProps<TTag> & {
  __rootTransition?: boolean;
};

function InternalDialog<
  TTag extends ValidComponent = typeof DEFAULT_DIALOG_TAG,
>(props: InternalDialogProps<TTag>): Element {
  const inherited = useOpenClosed();
  const generatedId = `headlessui-dialog-${createUniqueId()}`;
  const id = () => props.id ?? generatedId;
  const open = () =>
    props.open ?? Boolean(inherited?.() && inherited() & OpenClosedState.Open);
  const unmount = () => props.unmount ?? false;
  const closing = () =>
    Boolean(inherited?.() && inherited() & OpenClosedState.Closing);
  const [dialogElement, setDialogElement] = createSignal<HTMLElement | null>(
    null,
    { ownedWrite: true },
  );
  const [panelElement, setPanelElement] = createSignal<HTMLElement | null>(
    null,
    { ownedWrite: true },
  );
  const titleRegistrations: { id: string }[] = [];
  const [titleVersion, setTitleVersion] = createSignal(0, {
    ownedWrite: true,
  });
  const titleId = () => {
    titleVersion();
    return titleRegistrations.at(-1)?.id;
  };
  const registerTitle = (id: string) => {
    const registration = { id };
    titleRegistrations.push(registration);
    setTitleVersion((version) => version + 1);

    return () => {
      const index = titleRegistrations.indexOf(registration);
      if (index === -1) return;
      titleRegistrations.splice(index, 1);
      setTitleVersion((version) => version + 1);
    };
  };
  const ownerDocument = () => getOwnerDocument(dialogElement());
  const ownerWindow = () => ownerDocument()?.defaultView ?? null;
  const enabled = () => open();
  const close = () => props.onClose(false);
  const mainTreeNode = useMainTreeNode();
  const [portals, PortalWrapper] = useNestedPortals();
  const rootContainers = createRootContainers({
    defaultContainers: () => [panelElement() ?? dialogElement()],
    mainTreeNode,
    portals,
  });
  const resolveRootContainers = () => rootContainers.resolveContainers();
  const isTopLayer = createIsTopLayer(enabled, null);
  const effectsEnabled = () => enabled() && !closing();
  const inertEnabled = () => !props.__demoMode && effectsEnabled();

  createInertOthers(inertEnabled, {
    allowed: () => [
      dialogElement()?.closest<HTMLElement>("[data-headlessui-portal]") ??
        null,
    ],
    disallowed: () => [
      mainTreeNode()?.closest<HTMLElement>(
        "body > *:not(#headlessui-portal-root)",
      ) ?? null,
    ],
  });

  createOutsideClick(
    isTopLayer,
    resolveRootContainers,
    (event) => {
      event.preventDefault();
      close();
    },
    ownerDocument,
  );

  createEscape(isTopLayer, ownerWindow, (event) => {
    event.preventDefault();
    event.stopPropagation();

    const activeElement = ownerDocument()?.activeElement;
    if (activeElement && "blur" in activeElement) {
      (activeElement as HTMLElement).blur?.();
    }
    close();
  });

  createScrollLock(
    () => !props.__demoMode && effectsEnabled(),
    ownerDocument,
    () => resolveRootContainers().filter(DOM.isHTMLElement),
  );
  createOnDisappear(enabled, dialogElement, close);

  const [describedBy, DescriptionProvider] = useDescriptions();
  const touchDevice = createIsTouchDevice(ownerWindow);
  const focusTrapFeatures = () => {
    if (!enabled() || props.__demoMode) return FocusTrapFeatures.None;

    let features = FocusTrapFeatures.RestoreFocus |
      FocusTrapFeatures.TabLock;
    if (props.autofocus ?? props.autoFocus ?? true) {
      features |= FocusTrapFeatures.AutoFocus;
    }
    if (!touchDevice()) features |= FocusTrapFeatures.InitialFocus;
    return features;
  };

  const context: DialogContextValue = {
    close,
    open,
    panelElement,
    registerTitle,
    setPanelElement,
    titleId,
    unmount,
  };
  const slot: DialogRenderPropArg = {
    get open() {
      return open();
    },
  };
  let warnedOnRole = false;
  const role = (): DialogRole => {
    const value = props.role ?? "dialog";
    if (value === "dialog" || value === "alertdialog") return value;

    if (!warnedOnRole) {
      warnedOnRole = true;
      console.warn(
        `Invalid role [${value}] passed to <Dialog />. Only \`dialog\` and \`alertdialog\` are supported. Using \`dialog\` instead.`,
      );
    }
    return "dialog";
  };
  const visible = () => open() || Boolean(props.static);
  const shouldRender = () => visible() || !unmount();
  const theirProps = omit(
    props as AnyProps,
    "__demoMode",
    "__rootTransition",
    "afterEnter",
    "afterLeave",
    "as",
    "autofocus",
    "autoFocus",
    "beforeEnter",
    "beforeLeave",
    "children",
    "class",
    "enter",
    "entered",
    "enterFrom",
    "enterTo",
    "hidden",
    "initialFocus",
    "leave",
    "leaveFrom",
    "leaveTo",
    "onClose",
    "open",
    "ref",
    "role",
    "static",
    "style",
    "transition",
    "unmount",
  );
  const ourProps: AnyProps = {
    get id() {
      return id();
    },
    get role() {
      return role();
    },
    tabindex: -1,
    get "aria-modal"() {
      return !props.__demoMode && open() ? "true" : undefined;
    },
    get "aria-labelledby"() {
      return titleId();
    },
    get "aria-describedby"() {
      return describedBy();
    },
    get hidden() {
      return !visible() ? true : (props as AnyProps).hidden;
    },
    get style() {
      return resolvedStyle(
        (props as AnyProps).style as JSX.CSSProperties | string | undefined,
        !visible(),
      );
    },
    get class() {
      return resolvedClass(props.class, slot);
    },
    get "data-headlessui-state"() {
      return open() ? "open" : "";
    },
    get "data-open"() {
      return open() ? "" : undefined;
    },
  };
  const rootProps = mergeEventProps(theirProps, ourProps);
  const tag = () => props.as ?? DEFAULT_DIALOG_TAG;
  const content = () => resolvedChildren(props.children, slot);
  const bindDialog = (element: HTMLElement) => {
    assignRef(props.ref as Ref<HTMLElement>, element);
    setDialogElement(element);
  };

  const FocusTrapAdapter: Component<AnyProps> = (adapterProps) => (
    <FocusTrapComponent
      {...adapterProps}
      as={tag()}
      containers={resolveRootContainers}
      features={focusTrapFeatures()}
      initialFocus={props.initialFocus}
      initialFocusFallback={dialogElement}
    />
  );

  const dialog = () =>
    props.__rootTransition
      ? (
        <TransitionChildComponent
          {...rootProps}
          {...transitionProps(props)}
          as={FocusTrapAdapter}
          ref={bindDialog}
          transition={Boolean(props.transition)}
          unmount={props.unmount}
        >
          {content()}
        </TransitionChildComponent>
      )
      : (
        <FocusTrapComponent
          {...rootProps}
          as={tag()}
          containers={resolveRootContainers}
          features={focusTrapFeatures()}
          initialFocus={props.initialFocus}
          initialFocusFallback={dialogElement}
          ref={bindDialog}
        >
          {content()}
        </FocusTrapComponent>
      );
  // Freeze the provider subtree before handing it to Portal. Portal insertion
  // can read its lazy `children` prop more than once; recreating this provider
  // chain would register titles/descriptions and focus traps repeatedly.
  const portalContent = (
    <DialogContext value={context}>
      <PortalGroup target={dialogElement}>
        <ForcePortalRoot force={false}>
          <DescriptionProvider slot={slot} name="Dialog.Description">
            <PortalWrapper>
              <CloseProvider value={close}>
                <Show when={shouldRender()}>{dialog()}</Show>
              </CloseProvider>
            </PortalWrapper>
          </DescriptionProvider>
        </ForcePortalRoot>
      </PortalGroup>
    </DialogContext>
  );
  // Use Solid's owner-aware children helper to memoize this provider
  // projection. Flattening it in an ordinary reactive memo can subscribe the
  // outer Dialog to nested dynamic ranges and reconstruct stateful children
  // when an inner overlay opens.
  const stablePortalContent = resolveChildren(() => portalContent);

  return (
    <ResetOpenClosedProvider>
      <ForcePortalRoot force>
        <Portal ownerDocument={ownerDocument()}>
          {stablePortalContent()}
        </Portal>
      </ForcePortalRoot>
    </ResetOpenClosedProvider>
  );
}

function validateDialogProps<TTag extends ValidComponent>(
  props: DialogProps<TTag>,
  inherited: Accessor<OpenClosedState> | null,
): void {
  const hasOpen = hasOwn(props, "open") || inherited !== null;
  const hasOnClose = hasOwn(props, "onClose");

  if (!hasOpen && !hasOnClose) {
    throw new Error(
      "You have to provide an `open` and an `onClose` prop to the `Dialog` component.",
    );
  }
  if (!hasOpen) {
    throw new Error(
      "You provided an `onClose` prop to the `Dialog`, but forgot an `open` prop.",
    );
  }
  if (!hasOnClose) {
    throw new Error(
      "You provided an `open` prop to the `Dialog`, but forgot an `onClose` prop.",
    );
  }

  const open = untrack(() => props.open);
  if (inherited === null && typeof open !== "boolean") {
    throw new Error(
      `You provided an \`open\` prop to the \`Dialog\`, but the value is not a boolean. Received: ${open}`,
    );
  }
  const onClose = untrack(() => props.onClose);
  if (typeof onClose !== "function") {
    throw new Error(
      `You provided an \`onClose\` prop to the \`Dialog\`, but the value is not a function. Received: ${onClose}`,
    );
  }
}

function DialogRoot<
  TTag extends ValidComponent = typeof DEFAULT_DIALOG_TAG,
>(props: DialogProps<TTag>): Element {
  const inherited = useOpenClosed();
  validateDialogProps(props, inherited);

  const shouldUseBoundary = () =>
    (props.open !== undefined || Boolean(props.transition)) && !props.static;
  const boundaryProps = omit(props as AnyProps, "open", "ref");
  const directProps = omit(props as AnyProps, "ref", "transition");

  return (
    <MainTreeProvider>
      <Show
        when={shouldUseBoundary()}
        fallback={
          <InternalDialog
            {...(directProps as InternalDialogProps<TTag>)}
            __rootTransition={false}
            ref={props.ref}
            unmount={props.open !== undefined
              ? props.unmount ?? true
              : props.unmount}
          />
        }
      >
        <Transition
          as={Transparent}
          show={props.open}
          transition={false}
          unmount={props.unmount}
        >
          <InternalDialog
            {...(boundaryProps as InternalDialogProps<TTag>)}
            __rootTransition
            open={undefined}
            ref={props.ref}
          />
        </Transition>
      </Show>
    </MainTreeProvider>
  );
}

const DEFAULT_PANEL_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the dialog panel component.
 */
export type DialogPanelRenderPropArg = Readonly<{ open: boolean }>;

/**
 * Props accepted by the dialog panel component.
 */
export type DialogPanelProps<
  TTag extends ValidComponent = typeof DEFAULT_PANEL_TAG,
> = Props<
  TTag,
  DialogPanelRenderPropArg,
  never,
  TransitionClasses & TransitionEvents & { transition?: boolean },
  HTMLElement
>;

/**
 * Renders the panel for the dialog component family.
 */
export function DialogPanel<
  TTag extends ValidComponent = typeof DEFAULT_PANEL_TAG,
>(props: DialogPanelProps<TTag>): Element {
  const context = useContext(DialogContext);
  const generatedId = `headlessui-dialog-panel-${createUniqueId()}`;
  const id = () => props.id ?? generatedId;
  const slot: DialogPanelRenderPropArg = {
    get open() {
      return context.open();
    },
  };
  let boundElement: HTMLElement | null = null;
  const bindPanel = (element: HTMLElement) => {
    boundElement = element;
    context.setPanelElement(element);
  };
  onSettled(() => () => {
    if (context.panelElement() === boundElement) context.setPanelElement(null);
  });

  const theirProps = omit(
    props as AnyProps,
    "afterEnter",
    "afterLeave",
    "as",
    "beforeEnter",
    "beforeLeave",
    "children",
    "class",
    "enter",
    "entered",
    "enterFrom",
    "enterTo",
    "id",
    "leave",
    "leaveFrom",
    "leaveTo",
    "ref",
    "transition",
  );
  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return [props.ref as Ref<HTMLElement>, bindPanel];
    },
    get id() {
      return id();
    },
    get class() {
      return resolvedClass(props.class, slot);
    },
    get "data-headlessui-state"() {
      return context.open() ? "open" : "";
    },
    get "data-open"() {
      return context.open() ? "" : undefined;
    },
    onClick(event: MouseEvent) {
      event.stopPropagation();
    },
  };
  const panelProps = mergeEventProps(theirProps, ourProps);
  const content = () => resolvedChildren(props.children, slot);

  return (
    <Show
      when={props.transition}
      fallback={
        <DynamicElement
          {...panelProps}
          as={props.as ?? DEFAULT_PANEL_TAG}
        >
          {content()}
        </DynamicElement>
      }
    >
      <TransitionChildComponent
        {...panelProps}
        {...transitionProps(props)}
        as={props.as ?? DEFAULT_PANEL_TAG}
        unmount={context.unmount()}
      >
        {content()}
      </TransitionChildComponent>
    </Show>
  );
}

const DEFAULT_BACKDROP_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the dialog backdrop component.
 */
export type DialogBackdropRenderPropArg = Readonly<{ open: boolean }>;

/**
 * Props accepted by the dialog backdrop component.
 */
export type DialogBackdropProps<
  TTag extends ValidComponent = typeof DEFAULT_BACKDROP_TAG,
> = Props<
  TTag,
  DialogBackdropRenderPropArg,
  never,
  TransitionClasses & TransitionEvents & { transition?: boolean },
  HTMLElement
>;

/**
 * Renders the backdrop for the dialog component family.
 */
export function DialogBackdrop<
  TTag extends ValidComponent = typeof DEFAULT_BACKDROP_TAG,
>(props: DialogBackdropProps<TTag>): Element {
  const context = useContext(DialogContext);
  const slot: DialogBackdropRenderPropArg = {
    get open() {
      return context.open();
    },
  };
  const theirProps = omit(
    props as AnyProps,
    "afterEnter",
    "afterLeave",
    "as",
    "beforeEnter",
    "beforeLeave",
    "children",
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
  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return props.ref as Ref<HTMLElement>;
    },
    "aria-hidden": "true",
    get class() {
      return resolvedClass(props.class, slot);
    },
    get "data-headlessui-state"() {
      return context.open() ? "open" : "";
    },
    get "data-open"() {
      return context.open() ? "" : undefined;
    },
  };
  const backdropProps = mergeEventProps(theirProps, ourProps);
  const content = () => resolvedChildren(props.children, slot);

  return (
    <Show
      when={props.transition}
      fallback={
        <DynamicElement
          {...backdropProps}
          as={props.as ?? DEFAULT_BACKDROP_TAG}
        >
          {content()}
        </DynamicElement>
      }
    >
      <TransitionChildComponent
        {...backdropProps}
        {...transitionProps(props)}
        as={props.as ?? DEFAULT_BACKDROP_TAG}
        unmount={context.unmount()}
      >
        {content()}
      </TransitionChildComponent>
    </Show>
  );
}

const DEFAULT_TITLE_TAG = "h2" as const;

/**
 * Reactive state exposed to render-prop children of the dialog title component.
 */
export type DialogTitleRenderPropArg = Readonly<{ open: boolean }>;

/**
 * Props accepted by the dialog title component.
 */
export type DialogTitleProps<
  TTag extends ValidComponent = typeof DEFAULT_TITLE_TAG,
> = Props<TTag, DialogTitleRenderPropArg, never, { id?: string }, HTMLElement>;

/**
 * Renders the title for the dialog component family.
 */
export function DialogTitle<
  TTag extends ValidComponent = typeof DEFAULT_TITLE_TAG,
>(props: DialogTitleProps<TTag>): Element {
  const context = useContext(DialogContext);
  const generatedId = `headlessui-dialog-title-${createUniqueId()}`;
  const id = createMemo(() => props.id ?? generatedId);
  const slot: DialogTitleRenderPropArg = {
    get open() {
      return context.open();
    },
  };
  let unregister = untrack(() => context.registerTitle(id()));

  createEffect(
    id,
    (next) => {
      unregister();
      unregister = context.registerTitle(next);
    },
    { defer: true },
  );
  onSettled(() => () => unregister());

  const titleProps = mergeEventProps(
    omit(props as AnyProps, "as", "children", "class", "id", "ref"),
    {
      get ref(): Ref<HTMLElement> {
        return props.ref as Ref<HTMLElement>;
      },
      get id() {
        return id();
      },
      get class() {
        return resolvedClass(props.class, slot);
      },
      get "data-headlessui-state"() {
        return context.open() ? "open" : "";
      },
      get "data-open"() {
        return context.open() ? "" : undefined;
      },
    },
  );

  return (
    <DynamicElement {...titleProps} as={props.as ?? DEFAULT_TITLE_TAG}>
      {resolvedChildren(props.children, slot)}
    </DynamicElement>
  );
}

function DynamicElement(props: AnyProps & { as: ValidComponent }): Element {
  const Resolved = dynamic(() => props.as) as Component<AnyProps>;
  // Component children are lazy getters. Cache the resolved value so the
  // dynamic intrinsic's internal reads cannot instantiate stateful children
  // (such as DialogTitle and Description) more than once.
  const content = createMemo(() => props.children as Element);
  return (
    <Resolved {...omit(props, "as", "children")}>
      {content()}
    </Resolved>
  );
}

/**
 * Renders the description for the dialog component family.
 *
 * @deprecated Use `<Description>` instead.
 */
export const DialogDescription = Description as <
  TTag extends ValidComponent = "p",
>(props: DescriptionProps<TTag>) => Element;

/**
 * Renders the accessible, unstyled dialog component for Solid.
 */
export const Dialog: typeof DialogRoot & {
  Description: typeof DialogDescription;
  Panel: typeof DialogPanel;
  Title: typeof DialogTitle;
} = Object.assign(DialogRoot, {
  /** @deprecated Use `<DialogPanel>` instead. */
  Panel: DialogPanel,
  /** @deprecated Use `<DialogTitle>` instead. */
  Title: DialogTitle,
  /** @deprecated Use `<Description>` instead. */
  Description: DialogDescription,
});
