// WAI-ARIA: https://www.w3.org/WAI/ARIA/apg/patterns/listbox/
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
  merge,
  omit,
  onSettled,
  Show,
  untrack,
  useContext,
} from "solid-js";
import type { JSX, ValidComponent } from "@solidjs/web";
import { useDisabled } from "../../internal/disabled.tsx";
import {
  type AnchorPropsWithSelection,
  type AnchorToWithSelection,
  FloatingProvider,
  useFloatingPanel,
  useFloatingPanelProps,
  useFloatingReference,
  useFloatingReferenceProps,
  useResolvedAnchor,
} from "../../internal/floating.tsx";
import { useProvidedId } from "../../internal/id.tsx";
import {
  OpenClosedProvider,
  OpenClosedState,
  useOpenClosed,
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
} from "../../utils/focus-management.ts";
import { attemptSubmit, objectToFormEntries } from "../../utils/form.ts";
import { getTextValue } from "../../utils/get-text-value.ts";
import type { AnyProps } from "../../utils/merge-event-props.ts";
import { getOwnerDocument, isActiveElement } from "../../utils/owner.ts";
import {
  mergeEventProps,
  type PropsForFeatures,
  renderElement,
  RenderFeatures,
} from "../../utils/render.tsx";
import { useDescribedBy } from "../description/description.tsx";
import { Label, useLabelledBy, useLabels } from "../label/label.tsx";
import { Portal, useNestedPortals } from "../portal/portal.tsx";
import {
  ActivationTrigger,
  type ByComparator,
  compareListboxValues,
  ListboxActionType,
  ListboxMachine,
  type ListboxMachineData,
  type ListboxMachineState,
  type ListboxOptionDataRef,
  ListboxState,
  ValueMode,
} from "./listbox-machine.ts";

export type { ByComparator } from "./listbox-machine.ts";
export {
  ActivationTrigger,
  ListboxState,
  ValueMode,
} from "./listbox-machine.ts";

const Transparent: Component<{ children?: Element }> = (props) => (
  <>{props.children}</>
);

interface ListboxContextValue {
  readonly defaultButtonId: Accessor<string>;
  readonly data: ListboxMachineData<unknown>;
  readonly machine: ListboxMachine<unknown>;
  readonly state: Accessor<Readonly<ListboxMachineState<unknown>>>;
}

const ListboxContext = createContext<ListboxContextValue>();
const SelectedOptionContext = createContext(false);

const DEFAULT_LISTBOX_TAG = Transparent;

/**
 * Reactive state exposed to render-prop children of the listbox component.
 */
export type ListboxRenderPropArg<T> = Readonly<{
  disabled: boolean;
  invalid: boolean;
  open: boolean;
  value: T;
}>;

/**
 * Props accepted by the listbox component.
 */
export type ListboxProps<
  TTag extends ValidComponent = typeof DEFAULT_LISTBOX_TAG,
  TType = string,
  TActualType = TType extends readonly (infer Item)[] ? Item : TType,
> = Props<
  TTag,
  ListboxRenderPropArg<TType>,
  "value",
  {
    __demoMode?: boolean;
    by?: ByComparator<TActualType>;
    defaultValue?: TType;
    disabled?: boolean;
    form?: string;
    horizontal?: boolean;
    invalid?: boolean;
    multiple?: boolean;
    name?: string;
    onChange?: (value: TType) => void;
    value?: TType;
  },
  HTMLElement
>;

function ListboxRoot<
  TTag extends ValidComponent = typeof DEFAULT_LISTBOX_TAG,
  TType = string,
  TActualType = TType extends readonly (infer Item)[] ? Item : TType,
>(props: ListboxProps<TTag, TType, TActualType>): Element {
  const generatedId = `headlessui-listbox-${createUniqueId()}`;
  const inheritedId = useProvidedId();
  // A button ref does not exist during SSR. Share a deterministic fallback
  // with Label so its element type and `for` target survive hydration.
  const defaultButtonId = () =>
    inheritedId() ??
      generatedId.replace(
        "headlessui-listbox-",
        "headlessui-listbox-button-",
      );
  const inheritedDisabled = useDisabled();
  const initialDefault = untrack(() => props.defaultValue);
  const implicitDefault = untrack(() =>
    props.multiple ? [] as unknown as TType : undefined
  );
  const initialValue = untrack(() =>
    props.value !== undefined
      ? props.value
      : initialDefault !== undefined
      ? initialDefault
      : implicitDefault
  );
  const [internalValue, setInternalValue] = createSignal<{ value: TType }>(
    { value: initialValue as TType },
    { name: "listbox-value", ownedWrite: true },
  );
  const machine = ListboxMachine.create<TActualType>({
    id: generatedId,
    __demoMode: untrack(() => Boolean(props.__demoMode)),
  });
  const [state, setState] = createSignal<
    Readonly<ListboxMachineState<TActualType>>
  >(machine.state, { name: "listbox-state", ownedWrite: true });
  const optionsPropsRef = {
    current: { hold: false, static: false },
  };
  const listRef = { current: new Map<string, HTMLElement | null>() };

  const controlled = () => props.value !== undefined;
  const value = (): TType =>
    controlled() ? props.value as TType : internalValue().value;
  const disabled = () => props.disabled ?? inheritedDisabled() ?? false;
  const invalid = () => Boolean(props.invalid);
  const mode = (): ValueMode =>
    props.multiple ? ValueMode.Multi : ValueMode.Single;
  const orientation = (): "horizontal" | "vertical" =>
    props.horizontal ? "horizontal" : "vertical";
  const compare = (a: TActualType, z: TActualType): boolean =>
    compareListboxValues(props.by, a, z);
  const isSelected = (candidate: TActualType): boolean => {
    const current = value();
    if (mode() === ValueMode.Multi) {
      return Array.isArray(current) &&
        current.some((item) => compare(item as TActualType, candidate));
    }
    return compare(current as unknown as TActualType, candidate);
  };
  const commit = (
    next: TActualType | TActualType[] | undefined,
  ): void => {
    const cast = next as unknown as TType;
    if (!controlled()) flush(() => setInternalValue({ value: cast }));
    props.onChange?.(cast);
  };

  const data: ListboxMachineData<TActualType> = {
    compare,
    get disabled() {
      return disabled();
    },
    get invalid() {
      return invalid();
    },
    isSelected,
    listRef,
    get mode() {
      return mode();
    },
    onChange: commit,
    optionsPropsRef,
    get orientation() {
      return orientation();
    },
    get value() {
      return value() as unknown as TActualType | readonly TActualType[];
    },
  };
  createEffect(
    () => ({
      by: props.by,
      disabled: disabled(),
      invalid: invalid(),
      mode: mode(),
      orientation: orientation(),
      value: value(),
    }),
    (snapshot) => {
      const snapshotCompare = (a: TActualType, z: TActualType): boolean =>
        compareListboxValues(snapshot.by, a, z);
      machine.state.dataRef.current = {
        compare: snapshotCompare,
        disabled: snapshot.disabled,
        invalid: snapshot.invalid,
        isSelected(candidate) {
          if (snapshot.mode === ValueMode.Multi) {
            return Array.isArray(snapshot.value) && snapshot.value.some(
              (item) => snapshotCompare(item as TActualType, candidate),
            );
          }
          return snapshotCompare(
            snapshot.value as unknown as TActualType,
            candidate,
          );
        },
        listRef,
        mode: snapshot.mode,
        onChange: commit,
        optionsPropsRef,
        orientation: snapshot.orientation,
        value: snapshot.value as unknown as
          | TActualType
          | readonly TActualType[],
      };
    },
  );

  const context: ListboxContextValue = {
    defaultButtonId,
    data: data as ListboxMachineData<unknown>,
    machine: machine as ListboxMachine<unknown>,
    state: state as Accessor<Readonly<ListboxMachineState<unknown>>>,
  };
  const [portals, PortalWrapper] = useNestedPortals();
  const open = () => state().listboxState === ListboxState.Open;
  const topLayer = createIsTopLayer(open, "listbox-outside-click");
  const containers = createRootContainers({
    defaultContainers: () => [
      machine.state.buttonElement,
      machine.state.optionsElement,
    ],
    mainTreeNode: () => machine.state.buttonElement,
    portals,
  });

  createOutsideClick(
    () => open() && topLayer(),
    () => containers.resolveContainers(),
    (event, target) => {
      machine.actions.closeListbox();
      if (!isFocusableElement(target, FocusableMode.Loose)) {
        event.preventDefault();
        machine.state.buttonElement?.focus({ preventScroll: true });
      }
    },
    () => getOwnerDocument(machine.state.buttonElement),
  );
  createEscape(
    open,
    () => machine.state.buttonElement?.ownerDocument.defaultView ?? null,
    (event) => {
      event.preventDefault();
      machine.actions.closeListbox();
      machine.state.buttonElement?.focus({ preventScroll: true });
    },
  );

  const reset = (): void => {
    if (initialDefault !== undefined) {
      commit(initialDefault as unknown as TActualType | TActualType[]);
    } else if (!controlled()) {
      commit(
        implicitDefault as unknown as
          | TActualType
          | TActualType[]
          | undefined,
      );
    }
  };
  createEffect(
    () => ({ button: state().buttonElement, formId: props.form }),
    ({ button, formId }) => {
      if (!button) return;
      const candidate = formId
        ? button.ownerDocument.getElementById(formId)
        : button.closest("form");
      if (!candidate || candidate.tagName !== "FORM") return;
      const form = candidate as HTMLFormElement;
      form.addEventListener("reset", reset);
      return () => form.removeEventListener("reset", reset);
    },
  );
  const formEntries = createMemo(() => {
    const name = props.name;
    const current = value();
    if (name === null || name === undefined || current == null) return [];
    return objectToFormEntries({ [name]: current });
  });

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

  const [labelledBy, LabelProvider] = useLabels({ inherit: true });
  const labelProps: AnyProps = {
    get for() {
      return state().buttonElement?.id ?? defaultButtonId();
    },
  };
  const labelSlot: Record<string, unknown> = {
    get disabled() {
      return disabled();
    },
    get open() {
      return open();
    },
  };
  const slot: ListboxRenderPropArg<TType> = {
    get disabled() {
      return disabled();
    },
    get invalid() {
      return invalid();
    },
    get open() {
      return open();
    },
    get value() {
      return value();
    },
  };
  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return props.ref as Ref<HTMLElement>;
    },
  };

  return (
    <LabelProvider
      name="Listbox.Label"
      value={labelledBy}
      props={labelProps}
      slot={labelSlot}
    >
      <FloatingProvider>
        <PortalWrapper>
          <ListboxContext value={context}>
            <OpenClosedProvider
              value={() =>
                open() ? OpenClosedState.Open : OpenClosedState.Closed}
            >
              {formEntries().map(([fieldName, fieldValue]) => (
                <input
                  type="hidden"
                  hidden
                  readonly
                  style={{ display: "none" }}
                  form={props.form}
                  disabled={disabled() || undefined}
                  name={fieldName}
                  value={fieldValue}
                />
              ))}
              {renderElement({
                defaultTag: DEFAULT_LISTBOX_TAG,
                name: "Listbox",
                ourProps,
                slot,
                stateKeys: ["disabled", "invalid", "open"],
                theirProps: omit(
                  props as AnyProps,
                  "__demoMode",
                  "by",
                  "defaultValue",
                  "disabled",
                  "form",
                  "horizontal",
                  "invalid",
                  "multiple",
                  "name",
                  "onChange",
                  "ref",
                  "value",
                ),
              })}
            </OpenClosedProvider>
          </ListboxContext>
        </PortalWrapper>
      </FloatingProvider>
    </LabelProvider>
  );
}

const DEFAULT_BUTTON_TAG = "button" as const;

/**
 * Reactive state exposed to render-prop children of the listbox button component.
 */
export type ListboxButtonRenderPropArg<T = unknown> = Readonly<{
  active: boolean;
  autofocus: boolean;
  disabled: boolean;
  focus: boolean;
  hover: boolean;
  invalid: boolean;
  open: boolean;
  value: T;
}>;

type ListboxButtonPropsWeControl =
  | "aria-controls"
  | "aria-expanded"
  | "aria-haspopup"
  | "aria-labelledby";

/**
 * Props accepted by the listbox button component.
 */
export type ListboxButtonProps<
  TTag extends ValidComponent = typeof DEFAULT_BUTTON_TAG,
> = Props<
  TTag,
  ListboxButtonRenderPropArg,
  ListboxButtonPropsWeControl,
  {
    autofocus?: boolean;
    disabled?: boolean;
    type?: "button" | "reset" | "submit";
  },
  HTMLButtonElement
>;

/**
 * Renders the button for the listbox component family.
 */
export function ListboxButton<
  TTag extends ValidComponent = typeof DEFAULT_BUTTON_TAG,
>(props: ListboxButtonProps<TTag>): Element {
  const context = useContext(ListboxContext);
  const inheritedId = useProvidedId();
  const [element, setElement] = createSignal<HTMLButtonElement | null>(null, {
    ownedWrite: true,
  });
  const id = () => props.id ?? inheritedId() ?? context.defaultButtonId();
  const disabled = () => props.disabled ?? context.data.disabled ?? false;
  const autofocus = () => Boolean(props.autofocus);
  const floatingReference = useFloatingReference();
  const floatingReferenceProps = useFloatingReferenceProps();
  const open = () => context.state().listboxState === ListboxState.Open;
  let pointerType: string | null = null;
  const hasValue = () => {
    const value = context.data.value;
    return context.data.mode === ValueMode.Multi
      ? Array.isArray(value) && value.length > 0
      : value !== null && value !== undefined;
  };
  const setButtonElement = (next: HTMLButtonElement | null): void => {
    setElement(next);
    context.machine.actions.setButtonElement(next);
    // A custom Solid target can consume its getter-backed props before its
    // forwarded ref reveals the concrete DOM tag. Resolve the safe default at
    // that unowned DOM boundary once the element is known.
    if (
      next?.tagName === "BUTTON" &&
      untrack(() => props.type) === undefined &&
      !next.hasAttribute("type")
    ) next.setAttribute("type", "button");
  };

  const startQuickRelease = createQuickRelease(open, {
    action: (event) => {
      const button = context.machine.state.buttonElement;
      if (button?.contains(event.target)) return QuickReleaseAction.Ignore;

      const option = event.target.closest(
        '[role="option"]:not([data-disabled])',
      );
      if (DOM.isHTMLElement(option)) return QuickReleaseAction.Select(option);

      if (context.machine.state.optionsElement?.contains(event.target)) {
        return QuickReleaseAction.Ignore;
      }
      return QuickReleaseAction.Close;
    },
    close: () => context.machine.actions.closeListbox(),
    owner: () => getOwnerDocument(context.machine.state.buttonElement),
    select: () => context.machine.actions.selectActiveOption(),
    trigger: () => context.machine.state.buttonElement,
  });

  const handleKeyDown = (
    event: KeyboardEvent & { currentTarget: HTMLButtonElement },
  ): void => {
    if (disabled()) return;
    if (event.key === "Enter") {
      attemptSubmit(event.currentTarget);
      return;
    }
    if (event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      context.machine.actions.openListbox({
        focus: hasValue() ? Focus.Nothing : Focus.First,
      });
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      context.machine.actions.openListbox({
        focus: hasValue() ? Focus.Nothing : Focus.Last,
      });
    }
  };
  const handleKeyUp = (event: KeyboardEvent): void => {
    if (event.key === " ") event.preventDefault();
  };
  const handleKeyPress = (event: KeyboardEvent): void => {
    event.preventDefault();
  };
  const toggle = (event: Event): void => {
    if (open()) {
      flush(() => context.machine.actions.closeListbox());
      element()?.focus({ preventScroll: true });
    } else {
      event.preventDefault();
      context.machine.actions.openListbox({ focus: Focus.Nothing });
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

  const labelledBy = useLabelledBy([id]);
  const describedBy = useDescribedBy();
  const focusRing = createFocusRing({ disabled, focusVisibleOnly: true });
  const hover = createHover({ disabled });
  const activePress = createActivePress({ disabled });
  const slot: ListboxButtonRenderPropArg = {
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
    get invalid() {
      return context.data.invalid;
    },
    get open() {
      return open();
    },
    get value() {
      return context.data.value;
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
      get ref(): Ref<HTMLButtonElement> {
        return [
          props.ref as Ref<HTMLButtonElement>,
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
        const resolved = element();
        return resolved?.tagName === "BUTTON" &&
            !resolved.hasAttribute("type")
          ? "button"
          : undefined;
      },
      "aria-haspopup": "listbox",
      get "aria-controls"() {
        return context.state().optionsElement?.id;
      },
      get "aria-expanded"() {
        return open() ? "true" : "false";
      },
      get "aria-labelledby"() {
        return labelledBy();
      },
      get "aria-describedby"() {
        return describedBy();
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
      onPointerDown: handlePointerDown,
      onClick: handleClick,
      onKeyDown: handleKeyDown,
      onKeyPress: handleKeyPress,
      onKeyUp: handleKeyUp,
    },
    focusRing.focusProps,
    hover.hoverProps,
    activePress.pressProps,
  );

  return renderElement({
    defaultTag: DEFAULT_BUTTON_TAG,
    name: "Listbox.Button",
    ourProps,
    slot,
    stateKeys: [
      "active",
      "autofocus",
      "disabled",
      "focus",
      "hover",
      "invalid",
      "open",
    ],
    theirProps,
  });
}

/**
 * Placement values accepted by anchored listbox content.
 */
export type ListboxAnchorTo = AnchorToWithSelection;
/**
 * Floating-position configuration for anchored listbox content.
 */
export type ListboxAnchorConfig = Exclude<
  AnchorPropsWithSelection,
  boolean | string
>;
/**
 * Anchor configuration accepted by the listbox component family.
 */
export type ListboxAnchor = AnchorPropsWithSelection;

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

const DEFAULT_OPTIONS_TAG = "div" as const;
const OPTIONS_RENDER_FEATURES = RenderFeatures.RenderStrategy |
  RenderFeatures.Static;

/**
 * Reactive state exposed to render-prop children of the listbox options component.
 */
export type ListboxOptionsRenderPropArg = Readonly<{ open: boolean }>;

type ListboxOptionsPropsWeControl =
  | "aria-activedescendant"
  | "aria-labelledby"
  | "aria-multiselectable"
  | "aria-orientation"
  | "role"
  | "tabindex";

type ListboxOptionsOverrides =
  & PropsForFeatures<typeof OPTIONS_RENDER_FEATURES>
  & {
    anchor?: ListboxAnchor;
    modal?: boolean;
    portal?: boolean;
    transition?: boolean;
  };

/**
 * Props accepted by the listbox options component.
 */
export type ListboxOptionsProps<
  TTag extends ValidComponent = typeof DEFAULT_OPTIONS_TAG,
> = Props<
  TTag,
  ListboxOptionsRenderPropArg,
  ListboxOptionsPropsWeControl,
  ListboxOptionsOverrides,
  HTMLElement
>;

/**
 * Renders the options for the listbox component family.
 */
export function ListboxOptions<
  TTag extends ValidComponent = typeof DEFAULT_OPTIONS_TAG,
>(props: ListboxOptionsProps<TTag>): Element {
  const context = useContext(ListboxContext);
  const generatedId = `headlessui-listbox-options-${createUniqueId()}`;
  const openClosed = useOpenClosed();
  const [element, setElement] = createSignal<HTMLElement | null>(null, {
    name: "listbox-options-element",
    ownedWrite: true,
  });
  const [visible, setVisible] = createSignal(
    // Portal target application can construct this subtree inside an effect
    // callback, so seed from the machine snapshot instead of the subscription
    // signal. The transition effect below owns subsequent reactive updates.
    context.machine.state.listboxState === ListboxState.Open,
    { name: "listbox-options-visible", ownedWrite: true },
  );
  const [initial, setInitial] = createSignal(true, {
    name: "listbox-options-initial",
    ownedWrite: true,
  });
  const [ready, setReady] = createSignal(false, {
    name: "listbox-options-ready",
    ownedWrite: true,
  });
  const id = () => props.id ?? generatedId;
  const machineOpen = createMemo(() =>
    context.state().listboxState === ListboxState.Open
  );
  const show = () =>
    openClosed !== null
      ? (openClosed() & OpenClosedState.Open) === OpenClosedState.Open
      : machineOpen();
  const transitionEnabled = () => Boolean(props.transition);
  const anchor = useResolvedAnchor(() => props.anchor);
  const portalEnabled = () => Boolean(props.portal) || anchor() !== null;
  const modal = () => props.modal ?? true;
  const didButtonMove = createMemo(() =>
    context.machine.selectors.didButtonMove(
      context.state() as ListboxMachineState<unknown>,
    )
  );
  const panelEnabled = () => visible() && !didButtonMove();
  const effectiveValue = (): unknown =>
    context.machine.selectors.hasFrozenValue(
        context.state() as ListboxMachineState<unknown>,
      ) && !props.static
      ? context.state().frozenSelection
      : context.data.value;
  const selectedOptionIndex = (): number | null => {
    const placement = anchor();
    if (!placement?.to?.includes("selection")) return null;
    let index = context.state().options.findIndex((option) =>
      context.data.mode === ValueMode.Multi
        ? context.data.isSelected(option.dataRef.current.value)
        : context.data.compare(effectiveValue(), option.dataRef.current.value)
    );
    if (index === -1) index = 0;
    return index;
  };
  const floatingPlacement = () => {
    const placement = anchor();
    if (placement === null) return null;
    const index = selectedOptionIndex();
    return index === null ? placement : {
      ...placement,
      inner: {
        index,
        listRef: () => [...context.data.listRef.current.values()],
      },
    };
  };
  const [floatingRef, floatingStyles] = useFloatingPanel(floatingPlacement);
  const floatingPanelProps = useFloatingPanelProps();
  const buttonSize = createElementSize(
    panelEnabled,
    () => context.machine.state.buttonElement,
    true,
  );

  const scheduleFocus = (target: HTMLElement | null): void => {
    if (!target) return;
    queueMicrotask(() => {
      if (context.machine.state.listboxState !== ListboxState.Open) return;
      if (!target.isConnected || isActiveElement(target)) return;
      target.focus({ preventScroll: true });
    });
  };
  let sortObserver: MutationObserver | undefined;
  const setOptionsElement = (next: HTMLElement | null): void => {
    sortObserver?.disconnect();
    sortObserver = undefined;
    setElement(next);
    context.machine.actions.setOptionsElement(next);
    if (context.machine.state.listboxState === ListboxState.Open) {
      scheduleFocus(next);
    }
    if (next === null || typeof MutationObserver === "undefined") return;
    sortObserver = new MutationObserver(() =>
      context.machine.actions.sortOptions()
    );
    sortObserver.observe(next, { childList: true, subtree: true });
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
    () => Boolean(props.static),
    (isStatic) => {
      context.data.optionsPropsRef.current = { hold: false, static: isStatic };
    },
  );
  createOnDisappear(
    panelEnabled,
    () => context.machine.state.buttonElement,
    () => context.machine.actions.closeListbox(),
  );
  const ownerDocument = () =>
    getOwnerDocument(element() ?? context.machine.state.buttonElement);
  const modalEnabled = () =>
    !context.machine.state.__demoMode && modal() && machineOpen();
  createScrollLock(
    modalEnabled,
    ownerDocument,
    () =>
      [context.machine.state.buttonElement, element()].filter(
        (node): node is HTMLElement => node !== null,
      ),
  );
  createInertOthers(modalEnabled, {
    allowed: () => [context.machine.state.buttonElement, element()],
  });

  const searchCleanup = disposables();
  const handleKeyDown = (event: KeyboardEvent): void => {
    searchCleanup.dispose();

    if (event.key === " " && context.machine.state.searchQuery !== "") {
      event.preventDefault();
      event.stopPropagation();
      context.machine.actions.search(event.key);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      context.machine.actions.selectActiveOption();
      return;
    }
    const nextKey = context.data.orientation === "vertical"
      ? "ArrowDown"
      : "ArrowRight";
    const previousKey = context.data.orientation === "vertical"
      ? "ArrowUp"
      : "ArrowLeft";
    const navigation = event.key === nextKey
      ? Focus.Next
      : event.key === previousKey
      ? Focus.Previous
      : event.key === "Home" || event.key === "PageUp"
      ? Focus.First
      : event.key === "End" || event.key === "PageDown"
      ? Focus.Last
      : null;
    if (navigation !== null) {
      event.preventDefault();
      event.stopPropagation();
      context.machine.actions.goToOption({ focus: navigation });
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      flush(() => context.machine.actions.closeListbox());
      context.machine.state.buttonElement?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      const button = context.machine.state.buttonElement;
      flush(() => context.machine.actions.closeListbox());
      focusFrom(
        button,
        event.shiftKey
          ? FocusManagementFocus.Previous
          : FocusManagementFocus.Next,
      );
      return;
    }
    if (event.key.length === 1) {
      context.machine.actions.search(event.key);
      searchCleanup.setTimeout(
        () => context.machine.actions.clearSearch(),
        350,
      );
    }
  };
  const handleKeyUp = (event: KeyboardEvent): void => {
    if (event.key === " ") event.preventDefault();
  };

  onSettled(() => {
    setReady(true);
    const unregisterOpen = context.machine.on(
      ListboxActionType.OpenListbox,
      (next) => scheduleFocus(next.optionsElement),
    );
    return () => {
      unregisterOpen();
      sortObserver?.disconnect();
      searchCleanup.dispose();
    };
  });

  const localData: ListboxMachineData<unknown> = {
    get compare() {
      return context.data.compare;
    },
    get disabled() {
      return context.data.disabled;
    },
    get invalid() {
      return context.data.invalid;
    },
    isSelected(candidate) {
      if (context.data.mode === ValueMode.Multi) {
        return context.data.isSelected(candidate);
      }
      return context.data.compare(effectiveValue(), candidate);
    },
    listRef: context.data.listRef,
    get mode() {
      return context.data.mode;
    },
    onChange(value) {
      context.data.onChange(value);
    },
    optionsPropsRef: context.data.optionsPropsRef,
    get orientation() {
      return context.data.orientation;
    },
    get value() {
      return context.data.value;
    },
  };
  const localContext: ListboxContextValue = {
    ...context,
    data: localData,
  };
  const slot: ListboxOptionsRenderPropArg = {
    get open() {
      return machineOpen();
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
      return [props.ref as Ref<HTMLElement>, floatingRef, setOptionsElement];
    },
    get id() {
      return id();
    },
    role: "listbox",
    get tabindex() {
      return machineOpen() ? 0 : undefined;
    },
    get "aria-activedescendant"() {
      return context.machine.selectors.activeDescendantId(
        context.state() as ListboxMachineState<unknown>,
      );
    },
    get "aria-multiselectable"() {
      return context.data.mode === ValueMode.Multi ? "true" : undefined;
    },
    get "aria-labelledby"() {
      return context.state().buttonElement?.id;
    },
    get "aria-orientation"() {
      return context.data.orientation;
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
      <ListboxContext value={localContext}>
        {renderElement({
          defaultTag: DEFAULT_OPTIONS_TAG,
          features: OPTIONS_RENDER_FEATURES,
          name: "Listbox.Options",
          ourProps,
          slot,
          stateKeys: ["open"],
          theirProps,
          visible: panelEnabled,
        })}
      </ListboxContext>
    </Portal>
  );
}

const DEFAULT_OPTION_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the listbox option component.
 */
export type ListboxOptionRenderPropArg = Readonly<{
  /** @deprecated Use `focus` instead. */
  active: boolean;
  disabled: boolean;
  focus: boolean;
  selected: boolean;
  selectedOption: boolean;
}>;

type ListboxOptionPropsWeControl =
  | "aria-disabled"
  | "aria-selected"
  | "role"
  | "tabindex";

/**
 * Props accepted by the listbox option component.
 */
export type ListboxOptionProps<
  TTag extends ValidComponent = typeof DEFAULT_OPTION_TAG,
  TType = string,
> = Props<
  TTag,
  ListboxOptionRenderPropArg,
  ListboxOptionPropsWeControl,
  { disabled?: boolean; value: TType },
  HTMLElement
>;

/**
 * Renders the option for the listbox component family.
 */
export function ListboxOption<
  TTag extends ValidComponent = typeof DEFAULT_OPTION_TAG,
  TType = string,
>(props: ListboxOptionProps<TTag, TType>): Element {
  const context = useContext(ListboxContext);
  const projected = useContext(SelectedOptionContext);
  const generatedId = `headlessui-listbox-option-${createUniqueId()}`;
  const id = () => props.id ?? generatedId;
  const disabled = () => Boolean(props.disabled);
  const value = () => props.value;
  const elementRef = { current: null as HTMLElement | null };
  const dataRef: ListboxOptionDataRef<unknown> = {
    current: {
      disabled: untrack(disabled),
      domRef: elementRef,
      get textValue() {
        return elementRef.current
          ? getTextValue(elementRef.current).toLowerCase()
          : "";
      },
      value: untrack(value),
    },
  };
  const active = () =>
    context.machine.selectors.isActive(
      context.state() as ListboxMachineState<unknown>,
      id(),
    );
  const selected = () => context.data.isSelected(value());
  const shouldScrollIntoView = () =>
    context.machine.selectors.shouldScrollIntoView(
      context.state() as ListboxMachineState<unknown>,
      id(),
    );
  let registeredId: string | null = null;
  let mappedId: string | null = null;
  const rekeyElement = (nextId: string): void => {
    if (projected || mappedId === nextId) return;
    if (mappedId !== null) context.data.listRef.current.delete(mappedId);
    mappedId = null;

    if (!elementRef.current) return;
    mappedId = nextId;
    context.data.listRef.current.set(nextId, elementRef.current);
  };
  const setElement = (next: HTMLElement | null): void => {
    if (!projected && mappedId !== null) {
      context.data.listRef.current.delete(mappedId);
      mappedId = null;
    }
    elementRef.current = next;
    if (projected || !next) return;

    const nextId = untrack(id);
    mappedId = nextId;
    context.data.listRef.current.set(nextId, next);
  };

  createEffect(
    () => ({ disabled: disabled(), value: value() }),
    (snapshot) => {
      dataRef.current.disabled = snapshot.disabled;
      dataRef.current.value = snapshot.value;
    },
  );
  createEffect(
    id,
    (nextId) => {
      rekeyElement(nextId);
      if (registeredId === null || registeredId === nextId) return;

      const previousId = registeredId;
      registeredId = nextId;
      context.machine.actions.unregisterOption(previousId);
      context.machine.actions.registerOption(nextId, dataRef);
    },
    { defer: true },
  );

  createEffect(shouldScrollIntoView, (shouldScroll) => {
    if (!shouldScroll) return;
    const cleanup = disposables();
    cleanup.requestAnimationFrame(() => {
      elementRef.current?.scrollIntoView?.({ block: "nearest" });
    });
    return cleanup.dispose;
  });
  onSettled(() => {
    if (projected) return;
    const initialId = id();
    registeredId = initialId;
    rekeyElement(initialId);
    context.machine.actions.registerOption(initialId, dataRef);
    return () => {
      const currentId = registeredId;
      registeredId = null;
      if (mappedId !== null) {
        context.data.listRef.current.delete(mappedId);
        mappedId = null;
      }
      if (currentId !== null) {
        context.machine.actions.unregisterOption(currentId);
      }
    };
  });

  const handleClick = (event: MouseEvent): void => {
    if (disabled()) {
      event.preventDefault();
      return;
    }
    context.machine.actions.selectOption(value());
  };
  const handleFocus = (): void => {
    if (disabled()) {
      context.machine.actions.goToOption({ focus: Focus.Nothing });
    } else {
      context.machine.actions.goToOption({ focus: Focus.Specific, id: id() });
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
    if (!moved(event) || disabled()) return;
    if (
      active() &&
      context.machine.state.activationTrigger === ActivationTrigger.Pointer
    ) return;
    context.machine.actions.goToOption(
      { focus: Focus.Specific, id: id() },
      ActivationTrigger.Pointer,
    );
  };
  const handleLeave = (event: MouseEvent | PointerEvent): void => {
    if (!moved(event) || disabled() || !active()) return;
    if (
      context.machine.state.activationTrigger !== ActivationTrigger.Pointer
    ) return;
    context.machine.actions.goToOption({ focus: Focus.Nothing });
  };

  const slot: ListboxOptionRenderPropArg = {
    get active() {
      return active();
    },
    get disabled() {
      return disabled();
    },
    get focus() {
      return active();
    },
    get selected() {
      return selected();
    },
    get selectedOption() {
      return projected && selected();
    },
  };
  const theirProps = omit(
    props as AnyProps,
    "disabled",
    "id",
    "ref",
    "value",
  );
  const ourProps: AnyProps = projected ? {} : {
    get ref(): Ref<HTMLElement> {
      return [props.ref as Ref<HTMLElement>, setElement];
    },
    get id() {
      return id();
    },
    role: "option",
    get tabindex() {
      return disabled() ? undefined : -1;
    },
    get "aria-disabled"() {
      return disabled() ? "true" : undefined;
    },
    get "aria-selected"() {
      return selected() ? "true" : "false";
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
    <Show when={!projected || selected()}>
      {renderElement({
        defaultTag: DEFAULT_OPTION_TAG,
        name: "Listbox.Option",
        ourProps,
        slot,
        stateKeys: [
          "active",
          "disabled",
          "focus",
          "selected",
          "selectedOption",
        ],
        theirProps,
      })}
    </Show>
  );
}

const DEFAULT_SELECTED_OPTION_TAG = Transparent;

/**
 * Reactive state exposed to render-prop children of the listbox selected option component.
 */
export type ListboxSelectedOptionRenderPropArg = Record<never, never>;
/**
 * Props accepted by the listbox selected option component.
 */
export type ListboxSelectedOptionProps<
  TTag extends ValidComponent = typeof DEFAULT_SELECTED_OPTION_TAG,
> = Props<
  TTag,
  ListboxSelectedOptionRenderPropArg,
  never,
  { options: Element; placeholder?: Element },
  HTMLElement
>;

/**
 * Renders the selected option for the listbox component family.
 */
export function ListboxSelectedOption<
  TTag extends ValidComponent = typeof DEFAULT_SELECTED_OPTION_TAG,
>(props: ListboxSelectedOptionProps<TTag>): Element {
  const context = useContext(ListboxContext);
  const placeholder = () =>
    context.data.value === undefined || context.data.value === null ||
    (context.data.mode === ValueMode.Multi &&
      Array.isArray(context.data.value) && context.data.value.length === 0);
  const theirProps = merge(
    omit(
      props as AnyProps,
      "options",
      "placeholder",
      "ref",
    ),
    {
      get children() {
        return placeholder() ? props.placeholder : props.options;
      },
    },
  );
  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return props.ref as Ref<HTMLElement>;
    },
  };

  return (
    <SelectedOptionContext value>
      {renderElement({
        defaultTag: DEFAULT_SELECTED_OPTION_TAG,
        name: "ListboxSelectedOption",
        ourProps,
        slot: {},
        theirProps,
      })}
    </SelectedOptionContext>
  );
}

/**
 * Reactive state exposed to render-prop children of the listbox label component.
 */
export type ListboxLabelRenderPropArg = Readonly<{
  disabled: boolean;
  open: boolean;
}>;

/**
 * Props accepted by the listbox label component.
 */
export type ListboxLabelProps<
  TTag extends ValidComponent = "label",
> = Props<
  TTag,
  ListboxLabelRenderPropArg,
  never,
  {
    for?: string;
    passive?: boolean;
  },
  HTMLElement
>;

/**
 * Renders the label for the listbox component family.
 *
 * @deprecated Use `<Label>` instead of `<ListboxLabel>`.
 */
export const ListboxLabel = Label as unknown as <
  TTag extends ValidComponent = "label",
>(props: ListboxLabelProps<TTag>) => Element;

/**
 * Renders the accessible, unstyled listbox component for Solid.
 */
export const Listbox: typeof ListboxRoot & {
  Button: typeof ListboxButton;
  Label: typeof ListboxLabel;
  Option: typeof ListboxOption;
  Options: typeof ListboxOptions;
  SelectedOption: typeof ListboxSelectedOption;
} = Object.assign(ListboxRoot, {
  /** @deprecated Use `<ListboxButton>` instead. */
  Button: ListboxButton,
  /** @deprecated Use `<Label>` instead. */
  Label: ListboxLabel,
  /** @deprecated Use `<ListboxOption>` instead. */
  Option: ListboxOption,
  /** @deprecated Use `<ListboxOptions>` instead. */
  Options: ListboxOptions,
  /** @deprecated Use `<ListboxSelectedOption>` instead. */
  SelectedOption: ListboxSelectedOption,
});
