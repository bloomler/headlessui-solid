// WAI-ARIA: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
import {
  type Accessor,
  type Component,
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  type Element,
  omit,
  onSettled,
  untrack,
  useContext,
} from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import {
  createActivePress,
  createFocusRing,
  createHover,
} from "../../primitives/interactions.ts";
import { CloseProvider } from "../../internal/close-provider.tsx";
import type { Props, Ref } from "../../types.ts";
import { isDisabledByFieldset } from "../../utils/bugs.ts";
import { isHTMLElement } from "../../utils/dom.ts";
import {
  type FocusableElementReference,
  focusElement,
} from "../../utils/focus-management.ts";
import { getOwnerDocument } from "../../utils/owner.ts";
import type { AnyProps } from "../../utils/merge-event-props.ts";
import {
  mergeEventProps,
  type PropsForFeatures,
  renderElement,
  RenderFeatures,
} from "../../utils/render.tsx";

const Transparent: Component<{ children?: Element }> = (props) => (
  <>{props.children}</>
);

const NO_DISCLOSURE_PANEL = Symbol("no-disclosure-panel");

/**
 * Element, reference, or accessor that can receive focus when the disclosure closes.
 */
export type DisclosureCloseTarget = FocusableElementReference;

interface DisclosureContextValue {
  readonly buttonElement: Accessor<HTMLElement | null>;
  readonly buttonId: Accessor<string | undefined>;
  readonly close: (target?: DisclosureCloseTarget) => void;
  readonly open: Accessor<boolean>;
  readonly panelId: Accessor<string | undefined>;
  readonly panelPresent: Accessor<boolean>;
  readonly setButtonElement: (element: HTMLElement | null) => void;
  readonly setButtonId: (id: string | undefined) => void;
  readonly setPanelId: (id: string | undefined) => void;
  readonly setPanelPresent: (present: boolean) => void;
  readonly toggle: () => void;
  readonly token: symbol;
}

const DisclosureContext = createContext<DisclosureContextValue>();
const DisclosurePanelContext = createContext<symbol>(NO_DISCLOSURE_PANEL);

function resolveCloseTarget(
  target: DisclosureCloseTarget | undefined,
): HTMLElement | null {
  if (target == null) return null;
  if (typeof target === "function") return target() ?? null;
  if (isHTMLElement(target)) return target;
  return target.current ?? null;
}

function registerReactiveId(
  value: Accessor<string>,
  current: Accessor<string | undefined>,
  setCurrent: (value: string | undefined) => void,
): void {
  let registered = untrack(value);

  createEffect(
    value,
    (next) => {
      registered = next;
      setCurrent(next);
    },
    { defer: true },
  );

  onSettled(() => {
    setCurrent(registered);
    return () => {
      if (current() === registered) setCurrent(undefined);
    };
  });
}

const DEFAULT_DISCLOSURE_TAG = Transparent;

/**
 * Reactive state exposed to render-prop children of the disclosure component.
 */
export type DisclosureRenderPropArg = Readonly<{
  close: (target?: DisclosureCloseTarget) => void;
  open: boolean;
}>;

/**
 * Props accepted by the disclosure component.
 */
export type DisclosureProps<
  TTag extends ValidComponent = typeof DEFAULT_DISCLOSURE_TAG,
> = Props<
  TTag,
  DisclosureRenderPropArg,
  never,
  { defaultOpen?: boolean },
  HTMLElement
>;

function DisclosureRoot<
  TTag extends ValidComponent = typeof DEFAULT_DISCLOSURE_TAG,
>(props: DisclosureProps<TTag>): Element {
  const [open, setOpen] = createSignal(
    untrack(() => Boolean(props.defaultOpen)),
  );
  const [buttonElement, setButtonElement] = createSignal<HTMLElement | null>(
    null,
    { ownedWrite: true },
  );
  const [buttonId, setButtonId] = createSignal<string | undefined>(undefined, {
    ownedWrite: true,
  });
  const [panelId, setPanelId] = createSignal<string | undefined>(undefined, {
    ownedWrite: true,
  });
  const [panelPresent, setPanelPresent] = createSignal(false, {
    ownedWrite: true,
  });

  const toggle = () => setOpen((value) => !value);
  const close = (target?: DisclosureCloseTarget) => {
    setOpen(false);

    const ownerDocument = getOwnerDocument(buttonElement());
    const fallback = buttonElement() ??
      (buttonId() ? ownerDocument?.getElementById(buttonId()!) ?? null : null);
    focusElement(resolveCloseTarget(target) ?? fallback);
  };

  const context: DisclosureContextValue = {
    buttonElement,
    buttonId,
    close,
    open,
    panelId,
    panelPresent,
    setButtonElement,
    setButtonId,
    setPanelId,
    setPanelPresent,
    toggle,
    token: Symbol("disclosure"),
  };

  const slot: DisclosureRenderPropArg = {
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
    <DisclosureContext value={context}>
      <CloseProvider value={close}>
        {renderElement({
          defaultTag: DEFAULT_DISCLOSURE_TAG,
          name: "Disclosure",
          ourProps,
          slot,
          stateKeys: ["open"],
          theirProps: omit(props as AnyProps, "defaultOpen", "ref"),
        })}
      </CloseProvider>
    </DisclosureContext>
  );
}

const DEFAULT_BUTTON_TAG = "button" as const;

/**
 * Reactive state exposed to render-prop children of the disclosure button component.
 */
export type DisclosureButtonRenderPropArg = Readonly<{
  active: boolean;
  autofocus: boolean;
  disabled: boolean;
  focus: boolean;
  hover: boolean;
  open: boolean;
}>;

type DisclosureButtonPropsWeControl = "aria-controls" | "aria-expanded";

/**
 * Props accepted by the disclosure button component.
 */
export type DisclosureButtonProps<
  TTag extends ValidComponent = typeof DEFAULT_BUTTON_TAG,
> = Props<
  TTag,
  DisclosureButtonRenderPropArg,
  DisclosureButtonPropsWeControl,
  {
    autofocus?: boolean;
    disabled?: boolean;
    id?: string;
    type?: "button" | "reset" | "submit";
  },
  HTMLElement
>;

/**
 * Renders the button for the disclosure component family.
 */
export function DisclosureButton<
  TTag extends ValidComponent = typeof DEFAULT_BUTTON_TAG,
>(props: DisclosureButtonProps<TTag>): Element {
  const context = useContext(DisclosureContext);
  const panelToken = useContext(DisclosurePanelContext);
  const isWithinPanel = panelToken === context.token;
  const generatedId = `headlessui-disclosure-button-${createUniqueId()}`;
  const id = () => props.id ?? generatedId;
  const disabled = () => Boolean(props.disabled);
  const autofocus = () => Boolean(props.autofocus);
  const [element, setElement] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });

  if (!isWithinPanel) {
    registerReactiveId(id, context.buttonId, context.setButtonId);
  }

  let boundElement: HTMLElement | null = null;
  const bindButton = (next: HTMLElement) => {
    boundElement = next;
    setElement(next);
    if (!isWithinPanel) context.setButtonElement(next);
  };

  onSettled(() => () => {
    if (
      !isWithinPanel && context.buttonElement() === boundElement
    ) context.setButtonElement(null);
  });

  const focusRing = createFocusRing({ disabled, focusVisibleOnly: true });
  const hover = createHover({ disabled });
  const activePress = createActivePress({ disabled });

  const handleKeyDown = (
    event: KeyboardEvent & { currentTarget: HTMLElement },
  ) => {
    if (disabled()) return;
    if (event.key !== " " && event.key !== "Enter") return;
    if (isWithinPanel && !context.open()) return;

    event.preventDefault();
    event.stopPropagation();
    context.toggle();

    if (isWithinPanel) focusElement(context.buttonElement());
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === " ") event.preventDefault();
  };

  const handleClick = (
    event: MouseEvent & { currentTarget: HTMLElement },
  ) => {
    if (event.button !== 0) return;
    if (isDisabledByFieldset(event.currentTarget) || disabled()) return;

    context.toggle();
    if (isWithinPanel) focusElement(context.buttonElement());
  };

  const slot: DisclosureButtonRenderPropArg = {
    get active() {
      return activePress.pressed();
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
      return context.open();
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
      return [props.ref as Ref<HTMLElement>, bindButton];
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

  const disclosureProps: AnyProps = isWithinPanel ? {} : {
    get id() {
      return id();
    },
    get "aria-controls"() {
      const panelId = context.panelId();
      return context.panelPresent() && panelId ? panelId : undefined;
    },
    get "aria-expanded"() {
      return context.open() ? "true" : "false";
    },
    onKeyUp: handleKeyUp,
  };

  const ourProps = mergeEventProps(
    commonProps,
    disclosureProps,
    focusRing.focusProps,
    hover.hoverProps,
    activePress.pressProps,
  );

  return renderElement({
    defaultTag: DEFAULT_BUTTON_TAG,
    name: "Disclosure.Button",
    ourProps,
    slot,
    stateKeys: ["open", "hover", "active", "disabled", "focus", "autofocus"],
    theirProps,
  });
}

const DEFAULT_PANEL_TAG = "div" as const;
const PANEL_RENDER_FEATURES = RenderFeatures.RenderStrategy |
  RenderFeatures.Static;

/**
 * Reactive state exposed to render-prop children of the disclosure panel component.
 */
export type DisclosurePanelRenderPropArg = Readonly<{
  close: (target?: DisclosureCloseTarget) => void;
  open: boolean;
}>;

/**
 * Props accepted by the disclosure panel component.
 */
export type DisclosurePanelProps<
  TTag extends ValidComponent = typeof DEFAULT_PANEL_TAG,
> = Props<
  TTag,
  DisclosurePanelRenderPropArg,
  never,
  & {
    id?: string;
    transition?: boolean;
  }
  & PropsForFeatures<typeof PANEL_RENDER_FEATURES>,
  HTMLElement
>;

/**
 * Renders the panel for the disclosure component family.
 */
export function DisclosurePanel<
  TTag extends ValidComponent = typeof DEFAULT_PANEL_TAG,
>(props: DisclosurePanelProps<TTag>): Element {
  const context = useContext(DisclosureContext);
  const generatedId = `headlessui-disclosure-panel-${createUniqueId()}`;
  const id = () => props.id ?? generatedId;
  const visible = () => context.open() || Boolean(props.static);
  const present = () => visible() || props.unmount === false;

  let registeredId = untrack(id);

  createEffect(
    id,
    (next) => {
      registeredId = next;
      context.setPanelId(next);
    },
    { defer: true },
  );
  createEffect(
    present,
    (next) => {
      context.setPanelPresent(next);
    },
    { defer: true },
  );

  onSettled(() => {
    context.setPanelId(registeredId);
    context.setPanelPresent(untrack(present));

    return () => {
      if (context.panelId() !== registeredId) return;
      context.setPanelId(undefined);
      context.setPanelPresent(false);
    };
  });

  const slot: DisclosurePanelRenderPropArg = {
    close: context.close,
    get open() {
      return context.open();
    },
  };

  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return props.ref as Ref<HTMLElement>;
    },
    get id() {
      return id();
    },
  };

  return (
    <DisclosurePanelContext value={context.token}>
      {renderElement({
        defaultTag: DEFAULT_PANEL_TAG,
        features: PANEL_RENDER_FEATURES,
        name: "Disclosure.Panel",
        ourProps,
        slot,
        stateKeys: ["open"],
        theirProps: omit(props as AnyProps, "id", "ref", "transition"),
        visible,
      })}
    </DisclosurePanelContext>
  );
}

/**
 * Renders the accessible, unstyled disclosure component for Solid.
 */
export const Disclosure: typeof DisclosureRoot & {
  Button: typeof DisclosureButton;
  Panel: typeof DisclosurePanel;
} = Object.assign(DisclosureRoot, {
  /** @deprecated use `<DisclosureButton>` instead of `<Disclosure.Button>` */
  Button: DisclosureButton,
  /** @deprecated use `<DisclosurePanel>` instead of `<Disclosure.Panel>` */
  Panel: DisclosurePanel,
});
