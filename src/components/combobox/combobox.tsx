// WAI-ARIA: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
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
  For,
  omit,
  onSettled,
  Show,
  untrack,
  useContext,
} from "solid-js";
import type { JSX, ValidComponent } from "@solidjs/web";
import { useDisabled } from "../../internal/disabled.tsx";
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
import { useProvidedId } from "../../internal/id.tsx";
import {
  OpenClosedProvider,
  OpenClosedState,
  useOpenClosed,
} from "../../internal/open-closed.tsx";
import { createElementSize } from "../../primitives/element-size.ts";
import { createDocumentEvent } from "../../primitives/events.ts";
import { createInertOthers } from "../../primitives/inert-others.ts";
import {
  createActivePress,
  createFocusRing,
  createHover,
} from "../../primitives/interactions.ts";
import { createOnDisappear } from "../../primitives/on-disappear.ts";
import { createOutsideClick } from "../../primitives/outside-click.ts";
import { createRootContainers } from "../../primitives/root-containers.tsx";
import { createScrollLock } from "../../primitives/scroll-lock.ts";
import { createIsTopLayer } from "../../primitives/top-layer.ts";
import { createTransition } from "../../primitives/transition.ts";
import type { Props, Ref } from "../../types.ts";
import { history } from "../../utils/active-element-history.ts";
import { Focus } from "../../utils/calculate-active-index.ts";
import { disposables } from "../../utils/disposables.ts";
import * as DOM from "../../utils/dom.ts";
import { objectToFormEntries } from "../../utils/form.ts";
import type { AnyProps } from "../../utils/merge-event-props.ts";
import { getOwnerDocument, isActiveElement } from "../../utils/owner.ts";
import { isMobile } from "../../utils/platform.ts";
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
  ComboboxActionType,
  ComboboxMachine,
  type ComboboxMachineData,
  type ComboboxMachineState,
  type ComboboxOptionDataRef,
  ComboboxState,
  compareComboboxValues,
  ValueMode,
} from "./combobox-machine.ts";
import {
  type ComboboxVirtualItem,
  ComboboxVirtualizer,
} from "./combobox-virtualizer.ts";

export type { ByComparator } from "./combobox-machine.ts";
export {
  ActivationTrigger,
  ComboboxState,
  ValueMode,
} from "./combobox-machine.ts";

const Transparent: Component<{ children?: Element }> = (props) => (
  <>{props.children}</>
);

/**
 * Normalizes a value type to its array representation.
 */
export type EnsureArray<T> = T extends readonly unknown[] ? T : T[];

interface ComboboxContextValue {
  readonly data: ComboboxMachineData<unknown>;
  readonly defaultInputId: Accessor<string>;
  readonly machine: ComboboxMachine<unknown>;
  readonly state: Accessor<Readonly<ComboboxMachineState<unknown>>>;
}

const ComboboxContext = createContext<ComboboxContextValue>();

interface VirtualRowContextValue {
  readonly item: Accessor<ComboboxVirtualItem>;
  observe(element: HTMLElement): () => void;
  readonly setSize: Accessor<number>;
}

const VirtualRowContext = createContext<VirtualRowContextValue | null>(null);

const DEFAULT_COMBOBOX_TAG = Transparent;

/**
 * Reactive state exposed to render-prop children of the combobox component.
 */
export type ComboboxRenderPropArg<TValue, TActive = TValue> = Readonly<{
  activeIndex: number | null;
  activeOption: TActive | null;
  disabled: boolean;
  invalid: boolean;
  open: boolean;
  value: TValue;
}>;

type ComboboxValue<TValue, TMultiple extends boolean | undefined> =
  TMultiple extends true ? EnsureArray<TValue> : TValue;

/**
 * Props accepted by the combobox component.
 */
export type ComboboxProps<
  TValue = string,
  TMultiple extends boolean | undefined = false,
  TTag extends ValidComponent = typeof DEFAULT_COMBOBOX_TAG,
> = Props<
  TTag,
  ComboboxRenderPropArg<ComboboxValue<TValue, TMultiple>, TValue>,
  "value",
  {
    __demoMode?: boolean;
    by?: ByComparator<TValue> | null;
    defaultValue?: ComboboxValue<TValue, TMultiple>;
    disabled?: boolean;
    form?: string;
    immediate?: boolean;
    invalid?: boolean;
    multiple?: TMultiple;
    name?: string;
    /** @deprecated The Combobox is nullable by default. */
    nullable?: boolean;
    onChange?: (
      value: TMultiple extends true ? EnsureArray<TValue> : TValue | null,
    ) => void;
    onClose?: () => void;
    value?: ComboboxValue<TValue, TMultiple>;
    virtual?: {
      disabled?: (value: TValue) => boolean;
      options: readonly TValue[];
    } | null;
  },
  HTMLElement
>;

function ComboboxRoot<
  TValue = string,
  TMultiple extends boolean | undefined = false,
  TTag extends ValidComponent = typeof DEFAULT_COMBOBOX_TAG,
>(props: ComboboxProps<TValue, TMultiple, TTag>): Element {
  const id = `headlessui-combobox-${createUniqueId()}`;
  const inheritedId = useProvidedId();
  // An input ref does not exist during SSR. Share a deterministic fallback
  // with Label so its element type and `for` target survive hydration.
  const defaultInputId = () =>
    inheritedId() ??
      id.replace("headlessui-combobox-", "headlessui-combobox-input-");
  const inheritedDisabled = useDisabled();
  const initialDefault = untrack(() => props.defaultValue);
  const implicitDefault = untrack(() => props.multiple ? [] : undefined);
  const initialValue = untrack(() =>
    props.value !== undefined
      ? props.value
      : initialDefault !== undefined
      ? initialDefault
      : implicitDefault
  );
  const [internalValue, setInternalValue] = createSignal<{ value: unknown }>(
    { value: initialValue },
    { name: "combobox-value", ownedWrite: true },
  );
  const initialVirtual = untrack(() => props.virtual);
  const machine = ComboboxMachine.create<unknown>({
    id,
    __demoMode: untrack(() => Boolean(props.__demoMode)),
    virtual: initialVirtual
      ? {
        disabled: initialVirtual.disabled as
          | ((value: unknown) => boolean)
          | undefined,
        options: initialVirtual.options,
      }
      : null,
  });
  const [state, setState] = createSignal<
    Readonly<ComboboxMachineState<unknown>>
  >(machine.state, { name: "combobox-state", ownedWrite: true });
  machine.on(ComboboxActionType.OpenCombobox, () => {
    // Solid can settle child refs while cloned template nodes are still
    // disconnected. Defer DOM ordering until the open transition has attached
    // the options tree so registration order cannot win over visual order.
    onSettled(() => {
      machine.actions.reorderOptions();
    });
  });
  const optionsPropsRef = {
    current: { hold: false, static: false },
  };

  const controlled = () => props.value !== undefined;
  const value = (): unknown =>
    controlled() ? props.value : internalValue().value;
  const disabled = () => props.disabled ?? inheritedDisabled() ?? false;
  const invalid = () => Boolean(props.invalid);
  const immediate = () => Boolean(props.immediate);
  const mode = () => props.multiple ? ValueMode.Multi : ValueMode.Single;
  const virtual = createMemo(() => state().virtual);
  const compare = (a: unknown, z: unknown): boolean =>
    compareComboboxValues(
      props.by as ByComparator<unknown> | null | undefined,
      a,
      z,
    );
  const calculateIndex = (candidate: unknown): number => {
    const virtual = machine.state.virtual;
    return virtual
      ? virtual.options.findIndex((option) => compare(option, candidate))
      : machine.state.options.findIndex((option) =>
        compare(option.dataRef.current.value, candidate)
      );
  };
  const isSelected = (candidate: unknown): boolean => {
    const current = value();
    return mode() === ValueMode.Multi
      ? Array.isArray(current) &&
        current.some((option) => compare(option, candidate))
      : compare(current, candidate);
  };
  const commit = (next: unknown): void => {
    if (!controlled()) flush(() => setInternalValue({ value: next }));
    const onChange = props.onChange as ((value: unknown) => void) | undefined;
    onChange?.(next);
  };

  const data: ComboboxMachineData<unknown> = {
    get __demoMode() {
      return Boolean(props.__demoMode);
    },
    calculateIndex,
    compare,
    get defaultValue() {
      return initialDefault;
    },
    get disabled() {
      return disabled();
    },
    get immediate() {
      return immediate();
    },
    get invalid() {
      return invalid();
    },
    isSelected,
    get mode() {
      return mode();
    },
    onChange: commit,
    get onClose() {
      return props.onClose;
    },
    optionsPropsRef,
    get value() {
      return value();
    },
    get virtual() {
      return virtual();
    },
  };
  // Refs and settled child registrations can run before the first effect.
  // Publish the live accessors synchronously so they never observe the
  // machine's inert bootstrap data, especially when virtual mode starts on.
  machine.state.dataRef.current = data;

  createEffect(
    () => ({
      by: props.by,
      demo: Boolean(props.__demoMode),
      disabled: disabled(),
      immediate: immediate(),
      invalid: invalid(),
      mode: mode(),
      onClose: props.onClose,
      value: value(),
      virtual: virtual(),
    }),
    (snapshot) => {
      const snapshotCompare = (a: unknown, z: unknown): boolean =>
        compareComboboxValues(
          snapshot.by as ByComparator<unknown> | null | undefined,
          a,
          z,
        );
      machine.state.dataRef.current = {
        __demoMode: snapshot.demo,
        calculateIndex(candidate) {
          return snapshot.virtual
            ? snapshot.virtual.options.findIndex((option) =>
              snapshotCompare(option, candidate)
            )
            : machine.state.options.findIndex((option) =>
              snapshotCompare(option.dataRef.current.value, candidate)
            );
        },
        compare: snapshotCompare,
        defaultValue: initialDefault,
        disabled: snapshot.disabled,
        immediate: snapshot.immediate,
        invalid: snapshot.invalid,
        isSelected(candidate) {
          return snapshot.mode === ValueMode.Multi
            ? Array.isArray(snapshot.value) &&
              snapshot.value.some((option) =>
                snapshotCompare(option, candidate)
              )
            : snapshotCompare(snapshot.value, candidate);
        },
        mode: snapshot.mode,
        onChange: commit,
        onClose: snapshot.onClose,
        optionsPropsRef,
        value: snapshot.value,
        virtual: snapshot.virtual,
      };
    },
  );

  createEffect(
    () => ({
      disabled: props.virtual?.disabled,
      options: props.virtual?.options,
      virtual: props.virtual !== null && props.virtual !== undefined,
    }),
    (snapshot) => {
      machine.actions.updateVirtualConfiguration(
        snapshot.virtual ? snapshot.options ?? [] : null,
        (snapshot.disabled as ((value: unknown) => boolean) | undefined) ??
          null,
      );
    },
    { defer: true },
  );

  const context: ComboboxContextValue = {
    data,
    defaultInputId,
    machine,
    state,
  };
  const open = createMemo(() => state().comboboxState === ComboboxState.Open);
  const [portals, PortalWrapper] = useNestedPortals();
  const topLayer = createIsTopLayer(open, "combobox-outside-click");
  const containers = createRootContainers({
    defaultContainers: () => [
      machine.state.buttonElement,
      machine.state.inputElement,
      machine.state.optionsElement,
    ],
    mainTreeNode: () =>
      machine.state.inputElement ?? machine.state.buttonElement,
    portals,
  });
  const fallbackDocument = typeof document === "undefined" ? null : document;
  const ownerDocument = () =>
    getOwnerDocument(
      machine.state.inputElement ?? machine.state.buttonElement,
    ) ??
      fallbackDocument;

  createOutsideClick(
    () => open() && topLayer(),
    () => untrack(containers.resolveContainers),
    () => machine.actions.closeCombobox(),
    ownerDocument,
  );

  const reset = (): void => {
    if (initialDefault !== undefined) commit(initialDefault);
    else if (!controlled()) commit(implicitDefault);
  };
  createEffect(
    () => ({
      element: state().inputElement ?? state().buttonElement,
      formId: props.form,
    }),
    ({ element, formId }) => {
      if (!element) return;
      const candidate = formId
        ? element.ownerDocument.getElementById(formId)
        : element.closest("form");
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
      return state().inputElement?.id ?? defaultInputId();
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
  const slot: ComboboxRenderPropArg<unknown> = {
    get activeIndex() {
      return machine.selectors.activeOptionIndex(
        state() as ComboboxMachineState<unknown>,
      );
    },
    get activeOption() {
      return machine.selectors.activeOption(
        state() as ComboboxMachineState<unknown>,
      );
    },
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
      name="Combobox.Label"
      value={labelledBy}
      props={labelProps}
      slot={labelSlot}
    >
      <FloatingProvider>
        <PortalWrapper>
          <ComboboxContext value={context}>
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
                defaultTag: DEFAULT_COMBOBOX_TAG,
                name: "Combobox",
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
                  "immediate",
                  "invalid",
                  "multiple",
                  "name",
                  "nullable",
                  "onChange",
                  "onClose",
                  "ref",
                  "value",
                  "virtual",
                ),
              })}
            </OpenClosedProvider>
          </ComboboxContext>
        </PortalWrapper>
      </FloatingProvider>
    </LabelProvider>
  );
}

const DEFAULT_INPUT_TAG = "input" as const;

/**
 * Reactive state exposed to render-prop children of the combobox input component.
 */
export type ComboboxInputRenderPropArg = Readonly<{
  autofocus: boolean;
  disabled: boolean;
  focus: boolean;
  hover: boolean;
  invalid: boolean;
  open: boolean;
}>;

type ComboboxInputPropsWeControl =
  | "aria-activedescendant"
  | "aria-autocomplete"
  | "aria-controls"
  | "aria-expanded"
  | "aria-labelledby"
  | "disabled"
  | "onChange"
  | "role";

/**
 * Change-event shape emitted by the combobox input component.
 */
export type ComboboxInputChangeEvent = InputEvent & {
  readonly currentTarget: HTMLInputElement;
  readonly target: HTMLInputElement;
};

/**
 * Props accepted by the combobox input component.
 */
export type ComboboxInputProps<
  TTag extends ValidComponent = typeof DEFAULT_INPUT_TAG,
  TType = string,
> = Props<
  TTag,
  ComboboxInputRenderPropArg,
  ComboboxInputPropsWeControl,
  {
    /** Legacy camel-case alias; Solid applications should prefer `autofocus`. */
    autoFocus?: boolean;
    autofocus?: boolean;
    defaultValue?: TType;
    disabled?: boolean;
    displayValue?: (item: TType) => string;
    onChange?: (event: ComboboxInputChangeEvent) => void;
  },
  HTMLInputElement
>;

/**
 * Renders the input for the combobox component family.
 */
export function ComboboxInput<
  TType = string,
  TTag extends ValidComponent = typeof DEFAULT_INPUT_TAG,
>(props: ComboboxInputProps<TTag, TType>): Element {
  const context = useContext(ComboboxContext);
  const inheritedId = useProvidedId();
  const [element, setElement] = createSignal<HTMLInputElement | null>(null, {
    name: "combobox-input-element",
    ownedWrite: true,
  });
  const id = () => props.id ?? inheritedId() ?? context.defaultInputId();
  const disabled = () => props.disabled ?? context.data.disabled ?? false;
  const autofocus = () => Boolean(props.autofocus ?? props.autoFocus);
  const type = () => (props as AnyProps).type ?? "text";
  const open = createMemo(() =>
    context.state().comboboxState === ComboboxState.Open
  );
  const floatingReference = useFloatingReference();
  const floatingReferenceProps = useFloatingReferenceProps();
  const cleanup = disposables();
  let composing = false;
  let preserveFullSelection = false;

  const setInputElement = (next: HTMLInputElement | null): void => {
    setElement(next);
    context.machine.actions.setInputElement(next);
  };
  const currentDisplayValue = (): string => {
    const current = context.data.value;
    if (typeof props.displayValue === "function" && current !== undefined) {
      return props.displayValue(current as TType) ?? "";
    }
    return typeof current === "string" ? current : "";
  };
  const clear = (): void => {
    context.machine.actions.change(null);
    if (context.machine.state.optionsElement) {
      context.machine.state.optionsElement.scrollTop = 0;
    }
    context.machine.actions.goToOption({ focus: Focus.Nothing });
  };

  createEffect(
    () => ({
      display: currentDisplayValue(),
      element: element(),
      state: context.state().comboboxState,
      typing: context.state().isTyping,
    }),
    (snapshot, previous) => {
      if (snapshot.typing || !snapshot.element) return;
      const input = snapshot.element;
      const restoreFullSelection = preserveFullSelection;
      if (
        previous === undefined || previous.element !== snapshot.element ||
        (previous.state === ComboboxState.Open &&
          snapshot.state === ComboboxState.Closed) ||
        previous.display !== snapshot.display
      ) {
        input.value = snapshot.display;
      }
      if (restoreFullSelection) {
        input.setSelectionRange(0, input.value.length);
      }
      cleanup.requestAnimationFrame(() => {
        if (context.machine.state.isTyping || !input.isConnected) return;
        if (!isActiveElement(input)) return;
        const { selectionEnd, selectionStart } = input;
        if (Math.abs((selectionEnd ?? 0) - (selectionStart ?? 0)) !== 0) {
          return;
        }
        if (selectionStart !== 0) return;
        input.setSelectionRange(input.value.length, input.value.length);
      });
    },
  );

  createEffect(
    () => ({
      element: element(),
      state: context.state().comboboxState,
      typing: context.state().isTyping,
    }),
    (snapshot, previous) => {
      if (
        snapshot.typing || !snapshot.element || previous === undefined ||
        previous.state !== ComboboxState.Closed ||
        snapshot.state !== ComboboxState.Open
      ) return;
      const input = snapshot.element;
      const current = input.value;
      const { selectionDirection, selectionEnd, selectionStart } = input;
      input.value = "";
      input.value = current;
      if (selectionDirection !== null) {
        input.setSelectionRange(
          selectionStart,
          selectionEnd,
          selectionDirection,
        );
      } else {
        input.setSelectionRange(selectionStart, selectionEnd);
      }
    },
  );

  const handleCompositionStart = (): void => {
    composing = true;
  };
  const handleCompositionEnd = (): void => {
    cleanup.nextFrame(() => composing = false);
  };
  const handleKeyDown = (
    event: KeyboardEvent & { currentTarget: HTMLInputElement },
  ): void => {
    context.machine.actions.setIsTyping(true);
    switch (event.key) {
      case "Enter": {
        if (context.machine.state.comboboxState !== ComboboxState.Open) return;
        if (composing) return;
        event.preventDefault();
        event.stopPropagation();
        if (
          context.machine.selectors.activeOptionIndex(
            context.machine.state,
          ) === null
        ) {
          context.machine.actions.closeCombobox();
          return;
        }
        context.machine.actions.selectActiveOption();
        if (context.machine.state.dataRef.current.mode === ValueMode.Single) {
          context.machine.actions.closeCombobox();
        }
        return;
      }
      case "ArrowDown":
        event.preventDefault();
        event.stopPropagation();
        if (context.machine.state.comboboxState === ComboboxState.Open) {
          context.machine.actions.goToOption({ focus: Focus.Next });
        } else {
          context.machine.actions.openCombobox();
        }
        return;
      case "ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        if (context.machine.state.comboboxState === ComboboxState.Open) {
          context.machine.actions.goToOption({ focus: Focus.Previous });
        } else {
          flush(() => context.machine.actions.openCombobox());
          if (!context.machine.state.dataRef.current.value) {
            context.machine.actions.goToOption({ focus: Focus.Last });
          }
        }
        return;
      case "Home":
        if (
          context.machine.state.comboboxState === ComboboxState.Closed ||
          event.shiftKey
        ) return;
        event.preventDefault();
        event.stopPropagation();
        context.machine.actions.goToOption({ focus: Focus.First });
        return;
      case "PageUp":
        event.preventDefault();
        event.stopPropagation();
        context.machine.actions.goToOption({ focus: Focus.First });
        return;
      case "End":
        if (
          context.machine.state.comboboxState === ComboboxState.Closed ||
          event.shiftKey
        ) return;
        event.preventDefault();
        event.stopPropagation();
        context.machine.actions.goToOption({ focus: Focus.Last });
        return;
      case "PageDown":
        event.preventDefault();
        event.stopPropagation();
        context.machine.actions.goToOption({ focus: Focus.Last });
        return;
      case "Escape":
        if (context.machine.state.comboboxState !== ComboboxState.Open) return;
        event.preventDefault();
        if (
          context.machine.state.optionsElement &&
          !context.machine.state.dataRef.current.optionsPropsRef.current.static
        ) event.stopPropagation();
        if (
          context.machine.state.dataRef.current.mode === ValueMode.Single &&
          context.machine.state.dataRef.current.value === null
        ) clear();
        context.machine.actions.closeCombobox();
        return;
      case "Tab":
        context.machine.actions.setIsTyping(false);
        if (context.machine.state.comboboxState !== ComboboxState.Open) return;
        if (
          context.machine.state.dataRef.current.mode === ValueMode.Single &&
          context.machine.state.activationTrigger !== ActivationTrigger.Focus
        ) context.machine.actions.selectActiveOption();
        context.machine.actions.closeCombobox();
        return;
    }
  };
  const handleInput = (
    event: InputEvent & {
      currentTarget: HTMLInputElement;
      target: HTMLInputElement;
    },
  ): void => {
    preserveFullSelection = false;
    props.onChange?.(event);
    const cleared =
      context.machine.state.dataRef.current.mode === ValueMode.Single &&
      event.currentTarget.value === "";
    if (cleared) clear();
    context.machine.actions.openCombobox();
    // Solid 2 stages the controlled-value snapshot until this native input turn
    // settles, so opening can briefly restore the stale selection as active.
    if (cleared) context.machine.actions.goToOption({ focus: Focus.Nothing });
  };
  const handleSelect = (
    event: Event & { currentTarget: HTMLInputElement },
  ): void => {
    const input = event.currentTarget;
    preserveFullSelection = input.selectionStart === 0 &&
      input.selectionEnd === input.value.length;
  };
  const handleBlur = (
    event: FocusEvent & { currentTarget: HTMLInputElement },
  ): void => {
    const related = (event.relatedTarget as HTMLElement | null) ??
      history.find((candidate) => candidate !== event.currentTarget) ?? null;
    if (related && context.machine.state.optionsElement?.contains(related)) {
      return;
    }
    if (related && context.machine.state.buttonElement?.contains(related)) {
      return;
    }
    if (context.machine.state.comboboxState !== ComboboxState.Open) return;
    event.preventDefault();
    if (
      context.machine.state.dataRef.current.mode === ValueMode.Single &&
      context.machine.state.dataRef.current.value === null
    ) clear();
    context.machine.actions.closeCombobox();
  };
  const handleFocus = (
    event: FocusEvent & { currentTarget: HTMLInputElement },
  ): void => {
    const input = event.currentTarget;
    preserveFullSelection = input.value.length > 0 &&
      input.selectionStart === 0 &&
      input.selectionEnd === input.value.length;
    const related = (event.relatedTarget as HTMLElement | null) ??
      history.find((candidate) => candidate !== event.currentTarget) ?? null;
    if (related && context.machine.state.buttonElement?.contains(related)) {
      return;
    }
    if (related && context.machine.state.optionsElement?.contains(related)) {
      return;
    }
    if (
      context.machine.state.dataRef.current.disabled ||
      !context.machine.state.dataRef.current.immediate ||
      context.machine.state.comboboxState === ComboboxState.Open
    ) return;
    queueMicrotask(() => {
      if (!input.isConnected) return;
      flush(() => context.machine.actions.openCombobox());
      context.machine.actions.setActivationTrigger(ActivationTrigger.Focus);
    });
  };

  onSettled(() => () => cleanup.dispose());

  const labelledBy = useLabelledBy();
  const describedBy = useDescribedBy();
  const focusRing = createFocusRing({ disabled, focusVisibleOnly: false });
  const hover = createHover({ disabled });
  const slot: ComboboxInputRenderPropArg = {
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
  };
  const theirProps = omit(
    props as AnyProps,
    "autoFocus",
    "autofocus",
    "defaultValue",
    "disabled",
    "displayValue",
    "id",
    "onChange",
    "ref",
    "type",
  );
  const ourProps = mergeEventProps(
    floatingReferenceProps,
    {
      get ref(): Ref<HTMLInputElement> {
        return [
          props.ref as Ref<HTMLInputElement>,
          floatingReference,
          setInputElement,
        ];
      },
      get id() {
        return id();
      },
      role: "combobox",
      get type() {
        return type();
      },
      get "aria-controls"() {
        return context.state().optionsElement?.id;
      },
      get "aria-expanded"() {
        return open() ? "true" : "false";
      },
      get "aria-activedescendant"() {
        return context.machine.selectors.activeDescendantId(
          context.state() as ComboboxMachineState<unknown>,
        );
      },
      get "aria-labelledby"() {
        return labelledBy();
      },
      get "aria-describedby"() {
        return describedBy();
      },
      "aria-autocomplete": "list",
      get defaultValue() {
        if (props.defaultValue !== undefined) return props.defaultValue;
        const rootDefault = context.data.defaultValue;
        return rootDefault !== undefined
          ? props.displayValue?.(rootDefault as TType) ?? rootDefault
          : undefined;
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
      onCompositionStart: handleCompositionStart,
      onCompositionEnd: handleCompositionEnd,
      onKeyDown: handleKeyDown,
      onInput: handleInput,
      onSelect: handleSelect,
      onFocus: handleFocus,
      onBlur: handleBlur,
    },
    focusRing.focusProps,
    hover.hoverProps,
  );

  return renderElement({
    defaultTag: DEFAULT_INPUT_TAG,
    name: "Combobox.Input",
    ourProps,
    slot,
    stateKeys: [
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

const DEFAULT_BUTTON_TAG = "button" as const;

/**
 * Reactive state exposed to render-prop children of the combobox button component.
 */
export type ComboboxButtonRenderPropArg<T = unknown> = Readonly<{
  active: boolean;
  autofocus: boolean;
  disabled: boolean;
  focus: boolean;
  hover: boolean;
  invalid: boolean;
  open: boolean;
  value: T;
}>;

type ComboboxButtonPropsWeControl =
  | "aria-controls"
  | "aria-expanded"
  | "aria-haspopup"
  | "aria-labelledby"
  | "disabled"
  | "tabindex";

/**
 * Props accepted by the combobox button component.
 */
export type ComboboxButtonProps<
  TTag extends ValidComponent = typeof DEFAULT_BUTTON_TAG,
> = Props<
  TTag,
  ComboboxButtonRenderPropArg,
  ComboboxButtonPropsWeControl,
  {
    /** Legacy camel-case alias; Solid applications should prefer `autofocus`. */
    autoFocus?: boolean;
    autofocus?: boolean;
    disabled?: boolean;
    type?: "button" | "reset" | "submit";
  },
  HTMLButtonElement
>;

function refocusComboboxInput(input: HTMLInputElement | null): void {
  if (!input || !input.isConnected || isActiveElement(input)) return;
  const value = input.value;
  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  input.focus({ preventScroll: true });
  if (input.value !== value) {
    input.setSelectionRange(input.value.length, input.value.length);
  } else if (selectionStart !== null && selectionEnd !== null) {
    input.setSelectionRange(selectionStart, selectionEnd);
  }
}

/**
 * Renders the button for the combobox component family.
 */
export function ComboboxButton<
  TTag extends ValidComponent = typeof DEFAULT_BUTTON_TAG,
>(props: ComboboxButtonProps<TTag>): Element {
  const context = useContext(ComboboxContext);
  const generatedId = `headlessui-combobox-button-${createUniqueId()}`;
  const [element, setElement] = createSignal<HTMLButtonElement | null>(null, {
    name: "combobox-button-element",
    ownedWrite: true,
  });
  const id = () => props.id ?? generatedId;
  const disabled = () => props.disabled ?? context.data.disabled ?? false;
  const autofocus = () => Boolean(props.autofocus ?? props.autoFocus);
  const open = createMemo(() =>
    context.state().comboboxState === ComboboxState.Open
  );
  let pointerType: string | null = null;
  let quickReleaseStart: { at: number; x: number; y: number } | null = null;

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

  const toggle = (): void => {
    if (context.machine.state.comboboxState === ComboboxState.Open) {
      context.machine.actions.closeCombobox();
    } else {
      context.machine.actions.openCombobox();
    }
    refocusComboboxInput(context.machine.state.inputElement);
  };

  const quickReleaseEnabled = () => open() && element() !== null;
  const quickReleaseOwner = () =>
    getOwnerDocument(element() ?? context.machine.state.inputElement);
  createDocumentEvent(
    quickReleaseEnabled,
    "pointerdown",
    (event) => {
      const trigger = context.machine.state.buttonElement;
      if (
        !trigger || !DOM.isNode(event.target) || !trigger.contains(event.target)
      ) {
        return;
      }
      quickReleaseStart = {
        at: event.timeStamp,
        x: event.clientX,
        y: event.clientY,
      };
    },
    undefined,
    quickReleaseOwner,
  );
  createDocumentEvent(
    quickReleaseEnabled,
    "pointerup",
    (event) => {
      const started = quickReleaseStart;
      quickReleaseStart = null;
      if (!started || !DOM.isHTMLElement(event.target)) return;
      if (
        Math.abs(event.clientX - started.x) < 5 &&
        Math.abs(event.clientY - started.y) < 5
      ) return;
      const target = event.target;
      if (context.machine.state.buttonElement?.contains(target)) return;
      if (context.machine.state.inputElement?.contains(target)) return;
      const option = target.closest('[role="option"]:not([data-disabled])');
      if (DOM.isHTMLElement(option)) {
        if (event.timeStamp - started.at > 200) {
          context.machine.actions.selectActiveOption();
          context.machine.actions.closeCombobox();
        }
        return;
      }
      if (context.machine.state.optionsElement?.contains(target)) return;
      context.machine.actions.closeCombobox();
    },
    true,
    quickReleaseOwner,
  );

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (disabled()) return;
    switch (event.key) {
      case " ":
      case "Enter":
        event.preventDefault();
        event.stopPropagation();
        if (context.machine.state.comboboxState === ComboboxState.Closed) {
          flush(() => context.machine.actions.openCombobox());
        }
        refocusComboboxInput(context.machine.state.inputElement);
        return;
      case "ArrowDown":
        event.preventDefault();
        event.stopPropagation();
        if (context.machine.state.comboboxState === ComboboxState.Closed) {
          flush(() => context.machine.actions.openCombobox());
          if (!context.machine.state.dataRef.current.value) {
            context.machine.actions.goToOption({ focus: Focus.First });
          }
        }
        refocusComboboxInput(context.machine.state.inputElement);
        return;
      case "ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        if (context.machine.state.comboboxState === ComboboxState.Closed) {
          flush(() => context.machine.actions.openCombobox());
          if (!context.machine.state.dataRef.current.value) {
            context.machine.actions.goToOption({ focus: Focus.Last });
          }
        }
        refocusComboboxInput(context.machine.state.inputElement);
        return;
      case "Escape":
        if (context.machine.state.comboboxState !== ComboboxState.Open) return;
        event.preventDefault();
        if (
          context.machine.state.optionsElement &&
          !context.machine.state.dataRef.current.optionsPropsRef.current.static
        ) event.stopPropagation();
        flush(() => context.machine.actions.closeCombobox());
        refocusComboboxInput(context.machine.state.inputElement);
        return;
    }
  };
  const handlePointerDown = (
    event: PointerEvent & { currentTarget: HTMLButtonElement },
  ): void => {
    pointerType = event.pointerType;
    if (disabled() || event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }
    event.preventDefault();
    toggle();
  };
  const handleClick = (event: MouseEvent): void => {
    if (disabled()) {
      event.preventDefault();
      return;
    }
    if (pointerType === "mouse") return;
    toggle();
  };

  const labelledBy = useLabelledBy([id]);
  const focusRing = createFocusRing({ disabled, focusVisibleOnly: true });
  const hover = createHover({ disabled });
  const activePress = createActivePress({ disabled });
  const slot: ComboboxButtonRenderPropArg = {
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
    "autoFocus",
    "autofocus",
    "disabled",
    "id",
    "ref",
    "type",
  );
  const ourProps = mergeEventProps(
    {
      get ref(): Ref<HTMLButtonElement> {
        return [props.ref as Ref<HTMLButtonElement>, setButtonElement];
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
      tabindex: -1,
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
      onPointerDown: handlePointerDown,
      onClick: handleClick,
    },
    focusRing.focusProps,
    hover.hoverProps,
    activePress.pressProps,
  );

  return renderElement({
    defaultTag: DEFAULT_BUTTON_TAG,
    name: "Combobox.Button",
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
 * Placement values accepted by anchored combobox content.
 */
export type ComboboxAnchorTo = AnchorTo;
/**
 * Floating-position configuration for anchored combobox content.
 */
export type ComboboxAnchorConfig = Exclude<AnchorProps, boolean | string>;
/**
 * Anchor configuration accepted by the combobox component family.
 */
export type ComboboxAnchor = AnchorProps;

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

function walkOptionsTree(container: HTMLElement): void {
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
        if (node.getAttribute("role") === "option") return reject;
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

function VirtualRow(props: {
  children?: Element;
  item: Accessor<ComboboxVirtualItem>;
  measure(index: number, element: HTMLElement): () => void;
  setSize: number;
}): Element {
  const context: VirtualRowContextValue = {
    item: props.item,
    observe(element) {
      return props.measure(props.item().index, element);
    },
    setSize: () => props.setSize,
  };
  return <VirtualRowContext value={context}>{props.children}
  </VirtualRowContext>;
}

const DEFAULT_OPTIONS_TAG = "div" as const;
const OPTIONS_RENDER_FEATURES = RenderFeatures.RenderStrategy |
  RenderFeatures.Static;

/**
 * Reactive state exposed to render-prop children of the combobox options component.
 */
export type ComboboxOptionsRenderPropArg<T = unknown> = Readonly<{
  open: boolean;
  option: T | undefined;
}>;

type ComboboxOptionsPropsWeControl =
  | "aria-labelledby"
  | "aria-multiselectable"
  | "role"
  | "tabindex";

type ComboboxOptionsOverrides =
  & PropsForFeatures<typeof OPTIONS_RENDER_FEATURES>
  & {
    anchor?: ComboboxAnchor;
    hold?: boolean;
    modal?: boolean;
    portal?: boolean;
    transition?: boolean;
  };

/**
 * Props accepted by the combobox options component.
 */
export type ComboboxOptionsProps<
  TTag extends ValidComponent = typeof DEFAULT_OPTIONS_TAG,
  TOption = unknown,
> = Props<
  TTag,
  ComboboxOptionsRenderPropArg<TOption>,
  ComboboxOptionsPropsWeControl,
  ComboboxOptionsOverrides,
  HTMLElement
>;

/**
 * Renders the options for the combobox component family.
 */
export function ComboboxOptions<
  TOption = unknown,
  TTag extends ValidComponent = typeof DEFAULT_OPTIONS_TAG,
>(props: ComboboxOptionsProps<TTag, TOption>): Element {
  const context = useContext(ComboboxContext);
  const generatedId = `headlessui-combobox-options-${createUniqueId()}`;
  const openClosed = useOpenClosed();
  const [element, setElement] = createSignal<HTMLElement | null>(null, {
    name: "combobox-options-element",
    ownedWrite: true,
  });
  const [visible, setVisible] = createSignal(
    untrack(() => context.state().comboboxState === ComboboxState.Open),
    { name: "combobox-options-visible", ownedWrite: true },
  );
  const [initial, setInitial] = createSignal(true, {
    name: "combobox-options-initial",
    ownedWrite: true,
  });
  const [ready, setReady] = createSignal(false, {
    name: "combobox-options-ready",
    ownedWrite: true,
  });
  const [virtualVersion, setVirtualVersion] = createSignal(0, {
    name: "combobox-virtual-layout",
    ownedWrite: true,
  });
  const id = () => props.id ?? generatedId;
  const machineOpen = createMemo(() =>
    context.state().comboboxState === ComboboxState.Open
  );
  const show = () =>
    openClosed !== null
      ? (openClosed() & OpenClosedState.Open) === OpenClosedState.Open
      : machineOpen();
  const transitionEnabled = () => Boolean(props.transition);
  const anchor = useResolvedAnchor(() => props.anchor);
  const portalEnabled = () => Boolean(props.portal) || anchor() !== null;
  const modal = () => props.modal ?? true;
  const didInputMove = createMemo(() =>
    context.machine.selectors.didInputMove(
      context.state() as ComboboxMachineState<unknown>,
    )
  );
  const panelEnabled = () => visible() && !didInputMove();
  const [floatingRef, floatingStyles] = useFloatingPanel(anchor);
  const floatingPanelProps = useFloatingPanelProps();
  const inputSize = createElementSize(
    panelEnabled,
    () => context.state().inputElement,
    true,
  );
  const buttonSize = createElementSize(
    panelEnabled,
    () => context.state().buttonElement,
    true,
  );
  const virtualizer = new ComboboxVirtualizer({
    estimateSize: 40,
    overscan: 12,
  });

  const setOptionsElement = (next: HTMLElement | null): void => {
    setElement(next);
    context.machine.actions.setOptionsElement(next);
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
    () => ({ hold: Boolean(props.hold), static: Boolean(props.static) }),
    (snapshot) => {
      context.data.optionsPropsRef.current = snapshot;
    },
  );
  createEffect(
    () => ({ element: element(), open: machineOpen() }),
    (snapshot) => {
      if (!snapshot.open || !snapshot.element) return;
      const cleanup = disposables();
      const update = () => walkOptionsTree(snapshot.element!);
      update();
      if (typeof MutationObserver !== "undefined") {
        const observer = new MutationObserver(update);
        observer.observe(snapshot.element, { childList: true, subtree: true });
        cleanup.add(() => observer.disconnect());
      }
      return cleanup.dispose;
    },
  );
  createOnDisappear(
    panelEnabled,
    () => context.state().inputElement,
    () => context.machine.actions.closeCombobox(),
  );
  const ownerDocument = () =>
    getOwnerDocument(
      element() ?? context.state().inputElement ??
        context.state().buttonElement,
    );
  const modalEnabled = () =>
    !context.state().__demoMode && modal() && machineOpen();
  createScrollLock(
    modalEnabled,
    ownerDocument,
    () =>
      [
        context.state().inputElement,
        context.state().buttonElement,
        element(),
      ].filter((node): node is HTMLElement => node !== null),
  );
  createInertOthers(modalEnabled, {
    allowed: () => [
      context.state().inputElement,
      context.state().buttonElement,
      element(),
    ],
  });

  const shouldFreeze = createMemo(() =>
    visible() && !machineOpen() && !props.static
  );
  let frozenValue = untrack(() => context.data.value);
  let frozenOptions = untrack(() => context.data.virtual?.options);
  createEffect(
    () => ({
      freeze: shouldFreeze(),
      options: context.data.virtual?.options,
      value: context.data.value,
    }),
    (snapshot) => {
      if (snapshot.freeze) return;
      frozenValue = snapshot.value;
      frozenOptions = snapshot.options;
    },
  );
  const effectiveValue = createMemo(() =>
    shouldFreeze() ? frozenValue : context.data.value
  );
  const emptyOptions: readonly unknown[] = [];
  const effectiveOptions = createMemo<readonly unknown[]>(() =>
    (shouldFreeze() ? frozenOptions : context.data.virtual?.options) ??
      emptyOptions
  );
  const effectiveVirtual = createMemo(() => {
    const virtual = context.data.virtual;
    return virtual === null ? null : {
      disabled: virtual.disabled,
      options: effectiveOptions(),
    };
  });
  virtualizer.configure({ count: untrack(() => effectiveOptions().length) });

  const syncVirtualViewport = (
    optionsElement: HTMLElement | null,
    count: number,
    virtual: boolean,
  ): void => {
    if (!optionsElement || !virtual) {
      virtualizer.configure({ count });
      return;
    }
    const styles = optionsElement.ownerDocument.defaultView?.getComputedStyle(
      optionsElement,
    );
    const paddingStart = parseFloat(
      styles?.paddingBlockStart || styles?.paddingTop || "0",
    ) || 0;
    const paddingEnd = parseFloat(
      styles?.paddingBlockEnd || styles?.paddingBottom || "0",
    ) || 0;
    const rectHeight = optionsElement.getBoundingClientRect().height;
    virtualizer.configure({
      count,
      paddingEnd,
      paddingStart,
      scrollTop: optionsElement.scrollTop,
      viewportSize: Math.max(
        0,
        (optionsElement.clientHeight || rectHeight) - paddingStart - paddingEnd,
      ),
    });
  };
  const bumpVirtualLayout = (): void => {
    setVirtualVersion((version) => version + 1);
  };
  createEffect(
    () => ({
      options: effectiveOptions(),
      optionsElement: element(),
      virtual: context.data.virtual !== null,
    }),
    (snapshot, previous) => {
      if (snapshot.options !== previous?.options) {
        virtualizer.resetMeasurements();
      }
      syncVirtualViewport(
        snapshot.optionsElement,
        snapshot.options.length,
        snapshot.virtual,
      );
      bumpVirtualLayout();
      const optionsElement = snapshot.optionsElement;
      if (!optionsElement || !snapshot.virtual) return;
      const handleVirtualScroll = () => {
        syncVirtualViewport(optionsElement, snapshot.options.length, true);
        bumpVirtualLayout();
      };
      optionsElement.addEventListener("scroll", handleVirtualScroll, {
        passive: true,
      });
      const observer = typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => handleVirtualScroll());
      observer?.observe(optionsElement);
      return () => {
        observer?.disconnect();
        optionsElement.removeEventListener("scroll", handleVirtualScroll);
      };
    },
  );
  const activeVirtualIndex = createMemo((): number | null =>
    context.machine.selectors.activeOptionIndex(
      context.state() as ComboboxMachineState<unknown>,
    )
  );
  const activationTrigger = createMemo(() => context.state().activationTrigger);
  createEffect(
    () => ({
      active: activeVirtualIndex(),
      open: machineOpen(),
      options: effectiveOptions(),
      optionsElement: element(),
      trigger: activationTrigger(),
      virtual: context.data.virtual !== null,
    }),
    (snapshot) => {
      if (
        !snapshot.open || snapshot.active === null ||
        snapshot.trigger === ActivationTrigger.Pointer ||
        !snapshot.virtual
      ) return;
      syncVirtualViewport(
        snapshot.optionsElement,
        snapshot.options.length,
        true,
      );
      const scrollTop = virtualizer.scrollOffsetForIndex(snapshot.active);
      if (scrollTop !== null && snapshot.optionsElement) {
        snapshot.optionsElement.scrollTop = scrollTop;
        syncVirtualViewport(
          snapshot.optionsElement,
          snapshot.options.length,
          true,
        );
      }
      bumpVirtualLayout();
    },
  );
  const virtualIndices = (): number[] => {
    virtualVersion();
    // Registration updates machine state. Numeric keys keep those updates from
    // remounting and re-registering every visible option in a feedback loop.
    return virtualizer.indices(activeVirtualIndex());
  };
  const virtualItem = (index: number): ComboboxVirtualItem => {
    virtualVersion();
    return virtualizer.item(index) ?? { end: 0, index, size: 0, start: 0 };
  };
  const measureVirtualRow = (
    index: number,
    row: HTMLElement,
  ): () => void => {
    const measure = () => {
      const rect = row.getBoundingClientRect();
      const size = rect.height || row.offsetHeight;
      if (virtualizer.measure(index, size)) bumpVirtualLayout();
    };
    measure();
    if (typeof ResizeObserver === "undefined") return () => {};
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  };

  const localData: ComboboxMachineData<unknown> = {
    get __demoMode() {
      return context.data.__demoMode;
    },
    calculateIndex(candidate) {
      const virtual = effectiveVirtual();
      return virtual
        ? virtual.options.findIndex((option) =>
          context.data.compare(option, candidate)
        )
        : context.data.calculateIndex(candidate);
    },
    get compare() {
      return context.data.compare;
    },
    get defaultValue() {
      return context.data.defaultValue;
    },
    get disabled() {
      return context.data.disabled;
    },
    get immediate() {
      return context.data.immediate;
    },
    get invalid() {
      return context.data.invalid;
    },
    isSelected(candidate) {
      return context.data.mode === ValueMode.Multi
        ? context.data.isSelected(candidate)
        : context.data.compare(effectiveValue(), candidate);
    },
    get mode() {
      return context.data.mode;
    },
    onChange(value) {
      context.data.onChange(value);
    },
    get onClose() {
      return context.data.onClose;
    },
    optionsPropsRef: context.data.optionsPropsRef,
    get value() {
      return context.data.value;
    },
    get virtual() {
      return effectiveVirtual();
    },
  };
  const localContext: ComboboxContextValue = { ...context, data: localData };
  const labelledBy = useLabelledBy([
    () => context.state().buttonElement?.id,
  ]);
  const slot: ComboboxOptionsRenderPropArg<TOption> = {
    get open() {
      return machineOpen();
    },
    option: undefined,
  };
  const virtualContentStyle = (): JSX.CSSProperties => {
    virtualVersion();
    return {
      height: `${virtualizer.totalSize()}px`,
      position: "relative",
      width: "100%",
    };
  };
  const virtualContent = (
    <Show when={virtualIndices().length > 0}>
      <div
        style={virtualContentStyle()}
      >
        <For each={virtualIndices()}>
          {(index) => (
            <VirtualRow
              item={() => virtualItem(index)}
              measure={measureVirtualRow}
              setSize={effectiveOptions().length}
            >
              {typeof props.children === "function"
                ? (props.children as (
                  slot: ComboboxOptionsRenderPropArg<TOption>,
                ) => Element)({
                  get open() {
                    return machineOpen();
                  },
                  get option() {
                    return effectiveOptions()[index] as TOption;
                  },
                })
                : props.children}
            </VirtualRow>
          )}
        </For>
      </div>
    </Show>
  );
  const theirProps = mergeEventProps(
    omit(
      props as AnyProps,
      "anchor",
      "children",
      "hold",
      "id",
      "modal",
      "portal",
      "ref",
      "style",
      "transition",
    ),
    {
      get children() {
        return context.data.virtual === null ? props.children : virtualContent;
      },
      get style(): JSX.CSSProperties | string | undefined {
        return mergeStyle(props.style, {
          ...floatingStyles(),
          "--button-width": buttonSize.width,
          "--input-width": inputSize.width,
        }) as JSX.CSSProperties | string | undefined;
      },
    },
  );
  const handleWheel = (): void => {
    context.machine.actions.setActivationTrigger(ActivationTrigger.Pointer);
  };
  const handleMouseDown = (event: MouseEvent): void => {
    event.preventDefault();
    context.machine.actions.setActivationTrigger(ActivationTrigger.Pointer);
  };
  const ourProps = mergeEventProps(floatingPanelProps, {
    get ref(): Ref<HTMLElement> {
      return [props.ref as Ref<HTMLElement>, floatingRef, setOptionsElement];
    },
    get id() {
      return id();
    },
    role: "listbox",
    get "aria-multiselectable"() {
      return context.data.mode === ValueMode.Multi ? "true" : undefined;
    },
    get "aria-labelledby"() {
      return labelledBy();
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
    get onWheel() {
      return context.state().activationTrigger === ActivationTrigger.Pointer
        ? undefined
        : handleWheel;
    },
    onMouseDown: handleMouseDown,
  });

  onSettled(() => {
    setReady(true);
  });

  return (
    <Portal enabled={portalEnabled()} ownerDocument={ownerDocument()}>
      <ComboboxContext value={localContext}>
        {renderElement({
          defaultTag: DEFAULT_OPTIONS_TAG,
          features: OPTIONS_RENDER_FEATURES,
          name: "Combobox.Options",
          ourProps,
          slot,
          stateKeys: ["open"],
          theirProps,
          visible: panelEnabled,
        })}
      </ComboboxContext>
    </Portal>
  );
}

const DEFAULT_OPTION_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the combobox option component.
 */
export type ComboboxOptionRenderPropArg = Readonly<{
  /** @deprecated Use `focus` instead. */
  active: boolean;
  disabled: boolean;
  focus: boolean;
  selected: boolean;
}>;

type ComboboxOptionPropsWeControl =
  | "aria-disabled"
  | "aria-selected"
  | "role"
  | "tabindex";

/**
 * Props accepted by the combobox option component.
 */
export type ComboboxOptionProps<
  TTag extends ValidComponent = typeof DEFAULT_OPTION_TAG,
  TType = string,
> = Props<
  TTag,
  ComboboxOptionRenderPropArg,
  ComboboxOptionPropsWeControl,
  {
    disabled?: boolean;
    order?: number;
    value: TType;
  },
  HTMLElement
>;

/**
 * Renders the option for the combobox component family.
 */
export function ComboboxOption<
  TType = string,
  TTag extends ValidComponent = typeof DEFAULT_OPTION_TAG,
>(props: ComboboxOptionProps<TTag, TType>): Element {
  const context = useContext(ComboboxContext);
  const virtualRow = useContext(VirtualRowContext);
  const generatedId = `headlessui-combobox-option-${createUniqueId()}`;
  const id = () => props.id ?? generatedId;
  const value = () => props.value as unknown;
  const disabled = () =>
    props.disabled ?? context.data.virtual?.disabled(value()) ?? false;
  const order = () => props.order ?? null;
  const elementRef = { current: null as HTMLElement | null };
  // Refs run before onSettled. Start observation only once its owner-backed
  // teardown exists so immediate disposal cannot leak a ResizeObserver.
  let settled = false;
  let disposeMeasurement = () => {};
  const stopMeasurement = (): void => {
    disposeMeasurement();
    disposeMeasurement = () => {};
  };
  const startMeasurement = (): void => {
    if (!settled || !elementRef.current || !virtualRow) return;
    disposeMeasurement = virtualRow.observe(elementRef.current);
  };
  const setElement = (next: HTMLElement | null): void => {
    stopMeasurement();
    elementRef.current = next;
    startMeasurement();
  };
  const dataRef: ComboboxOptionDataRef<unknown> = {
    current: {
      disabled: untrack(disabled),
      domRef: elementRef,
      order: untrack(order),
      value: untrack(value),
    },
  };
  const active = () =>
    context.machine.selectors.isActive(
      context.state() as ComboboxMachineState<unknown>,
      value(),
      id(),
    );
  const selected = () => context.data.isSelected(value());
  const shouldScrollIntoView = () =>
    context.machine.selectors.shouldScrollIntoView(
      context.state() as ComboboxMachineState<unknown>,
      value(),
      id(),
    );

  createEffect(
    () => ({ disabled: disabled(), order: order(), value: value() }),
    (snapshot) => {
      dataRef.current.disabled = snapshot.disabled;
      dataRef.current.order = snapshot.order;
      dataRef.current.value = snapshot.value;
    },
  );
  let registered = false;
  let unregister = () => {};
  createEffect(
    id,
    (nextId) => {
      if (!registered) return;
      unregister();
      unregister = context.machine.actions.registerOption(nextId, dataRef);
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
    registered = true;
    unregister = context.machine.actions.registerOption(id(), dataRef);
    settled = true;
    startMeasurement();
    return () => {
      registered = false;
      settled = false;
      stopMeasurement();
      unregister();
    };
  });

  const select = (): void => {
    context.machine.actions.setIsTyping(false);
    context.machine.actions.change(value());
  };
  const handleMouseDown = (event: MouseEvent): void => {
    event.preventDefault();
    if (event.button !== 0 || disabled()) return;
    select();
    if (!isMobile()) {
      requestAnimationFrame(() =>
        refocusComboboxInput(context.machine.state.inputElement)
      );
    }
    if (context.data.mode === ValueMode.Single) {
      context.machine.actions.closeCombobox();
    }
  };
  const handleFocus = (): void => {
    if (disabled()) {
      context.machine.actions.goToOption({ focus: Focus.Nothing });
      return;
    }
    context.machine.actions.goToOption({
      focus: Focus.Specific,
      idx: context.data.calculateIndex(value()),
    });
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
      {
        focus: Focus.Specific,
        idx: context.data.calculateIndex(value()),
      },
      ActivationTrigger.Pointer,
    );
  };
  const handleLeave = (event: MouseEvent | PointerEvent): void => {
    if (!moved(event) || disabled() || !active()) return;
    if (context.data.optionsPropsRef.current.hold) return;
    if (
      context.machine.state.activationTrigger !== ActivationTrigger.Pointer
    ) return;
    context.machine.actions.goToOption({ focus: Focus.Nothing });
  };

  const slot: ComboboxOptionRenderPropArg = {
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
  };
  const theirProps = mergeEventProps(
    omit(
      props as AnyProps,
      "disabled",
      "id",
      "order",
      "ref",
      "style",
      "value",
    ),
    {
      get style(): JSX.CSSProperties | string | undefined {
        if (!virtualRow) return props.style;
        const item = virtualRow.item();
        return mergeStyle(props.style, {
          left: "0",
          overflowAnchor: "none",
          position: "absolute",
          top: "0",
          transform: `translateY(${item.start}px)`,
          width: "100%",
        }) as JSX.CSSProperties | string | undefined;
      },
    },
  );
  const ourProps: AnyProps = {
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
    get "aria-setsize"() {
      return virtualRow?.setSize();
    },
    get "aria-posinset"() {
      return virtualRow ? virtualRow.item().index + 1 : undefined;
    },
    get "data-index"() {
      return virtualRow?.item().index;
    },
    onMouseDown: handleMouseDown,
    onFocus: handleFocus,
    onPointerEnter: handleEnter,
    onMouseEnter: handleEnter,
    onPointerMove: handleMove,
    onMouseMove: handleMove,
    onPointerLeave: handleLeave,
    onMouseLeave: handleLeave,
  };

  return renderElement({
    defaultTag: DEFAULT_OPTION_TAG,
    name: "Combobox.Option",
    ourProps,
    slot,
    stateKeys: ["active", "disabled", "focus", "selected"],
    theirProps,
  });
}

/**
 * Reactive state exposed to render-prop children of the combobox label component.
 */
export type ComboboxLabelRenderPropArg = Readonly<{
  disabled: boolean;
  open: boolean;
}>;

/**
 * Props accepted by the combobox label component.
 */
export type ComboboxLabelProps<
  TTag extends ValidComponent = "label",
> = Props<
  TTag,
  ComboboxLabelRenderPropArg,
  never,
  {
    for?: string;
    passive?: boolean;
  },
  HTMLElement
>;

/**
 * Renders the label for the combobox component family.
 *
 * @deprecated Use `<Label>` instead of `<ComboboxLabel>`.
 */
export const ComboboxLabel = Label as unknown as <
  TTag extends ValidComponent = "label",
>(props: ComboboxLabelProps<TTag>) => Element;

/**
 * Renders the accessible, unstyled combobox component for Solid.
 */
export const Combobox: typeof ComboboxRoot & {
  Button: typeof ComboboxButton;
  Input: typeof ComboboxInput;
  Label: typeof ComboboxLabel;
  Option: typeof ComboboxOption;
  Options: typeof ComboboxOptions;
} = Object.assign(ComboboxRoot, {
  /** @deprecated Use `<ComboboxButton>` instead. */
  Button: ComboboxButton,
  /** @deprecated Use `<ComboboxInput>` instead. */
  Input: ComboboxInput,
  /** @deprecated Use `<Label>` instead. */
  Label: ComboboxLabel,
  /** @deprecated Use `<ComboboxOption>` instead. */
  Option: ComboboxOption,
  /** @deprecated Use `<ComboboxOptions>` instead. */
  Options: ComboboxOptions,
});
