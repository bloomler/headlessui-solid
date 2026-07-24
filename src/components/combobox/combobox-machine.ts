import { Machine } from "../../machine.ts";
import {
  ActionTypes as StackActionTypes,
  stackMachines,
} from "../../machines/stack-machine.ts";
import {
  calculateActiveIndex,
  Focus,
} from "../../utils/calculate-active-index.ts";
import {
  computeVisualPosition,
  detectMovement,
  ElementPositionState,
  type ElementPositionState as ElementPositionStateType,
} from "../../utils/element-movement.ts";
import { sortByDomNode } from "../../utils/focus-management.ts";
import {
  type ByComparator,
  compareListboxValues,
  toggleListboxValue,
} from "../listbox/listbox-machine.ts";

export type { ByComparator } from "../listbox/listbox-machine.ts";

export enum ComboboxState {
  Open,
  Closed,
}

export enum ValueMode {
  Single,
  Multi,
}

export enum ActivationTrigger {
  Pointer,
  Focus,
  Other,
}

export interface MutableRef<T> {
  current: T;
}

export interface ComboboxVirtualConfiguration<T> {
  readonly disabled: (value: T) => boolean;
  readonly options: readonly T[];
}

export interface ComboboxOptionData<T> {
  disabled: boolean;
  readonly domRef: MutableRef<HTMLElement | null>;
  order: number | null;
  value: T;
}

export interface ComboboxOptionDataRef<T> {
  current: ComboboxOptionData<T>;
}

export interface ComboboxOptionRecord<T> {
  readonly dataRef: ComboboxOptionDataRef<T>;
  readonly id: string;
}

export interface ComboboxMachineData<T> {
  readonly __demoMode: boolean;
  readonly calculateIndex: (value: unknown) => number;
  readonly compare: (a: unknown, z: unknown) => boolean;
  readonly defaultValue: unknown;
  readonly disabled: boolean;
  readonly immediate: boolean;
  readonly invalid: boolean;
  readonly isSelected: (value: unknown) => boolean;
  readonly mode: ValueMode;
  readonly onChange: (value: T | T[] | null) => void;
  readonly onClose?: () => void;
  readonly optionsPropsRef: MutableRef<{ hold: boolean; static: boolean }>;
  readonly value: unknown;
  readonly virtual: ComboboxVirtualConfiguration<T> | null;
}

export interface ComboboxMachineState<T> {
  readonly __demoMode: boolean;
  readonly activationTrigger: ActivationTrigger;
  readonly activeOptionIndex: number | null;
  readonly buttonElement: HTMLButtonElement | null;
  readonly comboboxState: ComboboxState;
  readonly dataRef: MutableRef<ComboboxMachineData<T>>;
  readonly defaultToFirstOption: boolean;
  readonly id: string;
  readonly inputElement: HTMLInputElement | null;
  readonly inputPositionState: ElementPositionStateType;
  readonly isTyping: boolean;
  readonly options: readonly ComboboxOptionRecord<T>[];
  readonly optionsElement: HTMLElement | null;
  readonly virtual: ComboboxVirtualConfiguration<T> | null;
}

export enum ComboboxActionType {
  OpenCombobox,
  CloseCombobox,
  GoToOption,
  SetTyping,
  RegisterOption,
  UnregisterOption,
  DefaultToFirstOption,
  SetActivationTrigger,
  UpdateVirtualConfiguration,
  SetInputElement,
  SetButtonElement,
  SetOptionsElement,
  MarkInputAsMoved,
  ReorderOptions,
}

type GoToOption =
  | { focus: Focus.Specific; idx: number }
  | { focus: Exclude<Focus, Focus.Specific> };

export type ComboboxAction<T> =
  | { type: ComboboxActionType.OpenCombobox }
  | { type: ComboboxActionType.CloseCombobox }
  | (GoToOption & {
    trigger?: ActivationTrigger;
    type: ComboboxActionType.GoToOption;
  })
  | { isTyping: boolean; type: ComboboxActionType.SetTyping }
  | {
    dataRef: ComboboxOptionDataRef<T>;
    id: string;
    type: ComboboxActionType.RegisterOption;
  }
  | { id: string; type: ComboboxActionType.UnregisterOption }
  | { type: ComboboxActionType.DefaultToFirstOption; value: boolean }
  | {
    trigger: ActivationTrigger;
    type: ComboboxActionType.SetActivationTrigger;
  }
  | {
    disabled: ((value: T) => boolean) | null;
    options: readonly T[] | null;
    type: ComboboxActionType.UpdateVirtualConfiguration;
  }
  | {
    element: HTMLInputElement | null;
    type: ComboboxActionType.SetInputElement;
  }
  | {
    element: HTMLButtonElement | null;
    type: ComboboxActionType.SetButtonElement;
  }
  | {
    element: HTMLElement | null;
    type: ComboboxActionType.SetOptionsElement;
  }
  | { type: ComboboxActionType.ReorderOptions }
  | { type: ComboboxActionType.MarkInputAsMoved };

function orderedState<T>(
  state: ComboboxMachineState<T>,
  options: readonly ComboboxOptionRecord<T>[] = state.options,
): Pick<ComboboxMachineState<T>, "activeOptionIndex" | "options"> {
  const active = state.activeOptionIndex === null
    ? null
    : state.options[state.activeOptionIndex] ?? null;
  const list = [...options];
  const hasExplicitOrder = list.length > 0 &&
    list[0]?.dataRef.current.order !== null;
  const allConnected = list.every((option) =>
    option.dataRef.current.domRef.current?.isConnected === true
  );
  const sorted = hasExplicitOrder
    ? list.sort((a, z) =>
      (a.dataRef.current.order ?? 0) - (z.dataRef.current.order ?? 0)
    )
    : allConnected
    ? sortByDomNode(list, (option) => option.dataRef.current.domRef.current)
    : list;
  const index = active === null ? null : sorted.indexOf(active);
  return {
    activeOptionIndex: index === -1 ? null : index,
    options: sorted,
  };
}

function defaultData<T>(): ComboboxMachineData<T> {
  return {
    __demoMode: false,
    calculateIndex: () => -1,
    compare: Object.is,
    defaultValue: undefined,
    disabled: false,
    immediate: false,
    invalid: false,
    isSelected: () => false,
    mode: ValueMode.Single,
    onChange: () => {},
    optionsPropsRef: { current: { hold: false, static: false } },
    value: undefined,
    virtual: null,
  };
}

export class ComboboxMachine<T> extends Machine<
  ComboboxMachineState<T>,
  ComboboxAction<T>
> {
  static create<T>(options: {
    __demoMode?: boolean;
    id: string;
    virtual?: {
      disabled?: (value: T) => boolean;
      options: readonly T[];
    } | null;
  }): ComboboxMachine<T> {
    const demo = options.__demoMode ?? false;
    const virtual = options.virtual
      ? {
        disabled: options.virtual.disabled ?? (() => false),
        options: options.virtual.options,
      }
      : null;
    return new ComboboxMachine<T>({
      __demoMode: demo,
      activationTrigger: ActivationTrigger.Other,
      activeOptionIndex: null,
      buttonElement: null,
      comboboxState: demo ? ComboboxState.Open : ComboboxState.Closed,
      dataRef: { current: defaultData<T>() },
      defaultToFirstOption: false,
      id: options.id,
      inputElement: null,
      inputPositionState: ElementPositionState.Idle,
      isTyping: false,
      options: [],
      optionsElement: null,
      virtual,
    });
  }

  constructor(initialState: ComboboxMachineState<T>) {
    super(initialState);

    const id = this.state.id;
    const stack = stackMachines.get(null);
    this.disposables.add(
      stack.on(StackActionTypes.Push, (state) => {
        if (
          !stack.selectors.isTop(state, id) &&
          this.state.comboboxState === ComboboxState.Open
        ) {
          this.actions.closeCombobox();
        }
      }),
    );
    this.on(ComboboxActionType.OpenCombobox, () => stack.actions.push(id));
    this.on(ComboboxActionType.CloseCombobox, () => stack.actions.pop(id));
    this.disposables.add(() => stack.actions.pop(id));

    this.disposables.group((cleanup) => {
      this.on(ComboboxActionType.CloseCombobox, (state) => {
        if (!state.inputElement) return;
        cleanup.dispose();
        cleanup.add(
          detectMovement(
            state.inputElement,
            state.inputPositionState,
            () => this.send({ type: ComboboxActionType.MarkInputAsMoved }),
          ),
        );
      });
    });
  }

  readonly actions = {
    change: (newValue: T | null): void => {
      const data = this.state.dataRef.current;
      if (data.mode === ValueMode.Single || newValue === null) {
        data.onChange(newValue);
        return;
      }
      data.onChange(
        toggleListboxValue(
          Array.isArray(data.value) ? data.value as readonly T[] : [],
          newValue,
          (a, z) => data.compare(a, z),
        ),
      );
    },
    closeCombobox: (): void => {
      this.send({ type: ComboboxActionType.CloseCombobox });
      this.send({
        type: ComboboxActionType.DefaultToFirstOption,
        value: false,
      });
      this.state.dataRef.current.onClose?.();
    },
    goToOption: (
      focus: GoToOption,
      trigger?: ActivationTrigger,
    ): void => {
      this.send({
        type: ComboboxActionType.DefaultToFirstOption,
        value: false,
      });
      this.send({
        ...focus,
        trigger,
        type: ComboboxActionType.GoToOption,
      } as ComboboxAction<T>);
    },
    openCombobox: (): void => {
      this.send({ type: ComboboxActionType.OpenCombobox });
      this.send({
        type: ComboboxActionType.DefaultToFirstOption,
        value: true,
      });
    },
    registerOption: (
      id: string,
      dataRef: ComboboxOptionDataRef<T>,
    ): () => void => {
      this.send({
        dataRef,
        id,
        type: ComboboxActionType.RegisterOption,
      });
      return () => {
        if (
          this.state.activeOptionIndex ===
            this.state.dataRef.current.calculateIndex(dataRef.current.value)
        ) {
          this.send({
            type: ComboboxActionType.DefaultToFirstOption,
            value: true,
          });
        }
        this.send({ id, type: ComboboxActionType.UnregisterOption });
      };
    },
    reorderOptions: (): void => {
      this.send({ type: ComboboxActionType.ReorderOptions });
    },
    selectActiveOption: (): void => {
      const index = this.selectors.activeOptionIndex(this.state);
      if (index === null) return;
      this.actions.setIsTyping(false);
      const value = this.state.virtual
        ? this.state.virtual.options[index]
        : this.state.options[index]?.dataRef.current.value;
      this.actions.change(value as T);
      this.actions.goToOption({ focus: Focus.Specific, idx: index });
    },
    setActivationTrigger: (trigger: ActivationTrigger): void => {
      this.send({
        trigger,
        type: ComboboxActionType.SetActivationTrigger,
      });
    },
    setButtonElement: (element: HTMLButtonElement | null): void => {
      this.send({ element, type: ComboboxActionType.SetButtonElement });
    },
    setInputElement: (element: HTMLInputElement | null): void => {
      this.send({ element, type: ComboboxActionType.SetInputElement });
    },
    setIsTyping: (isTyping: boolean): void => {
      this.send({ isTyping, type: ComboboxActionType.SetTyping });
    },
    setOptionsElement: (element: HTMLElement | null): void => {
      this.send({ element, type: ComboboxActionType.SetOptionsElement });
    },
    updateVirtualConfiguration: (
      options: readonly T[] | null,
      disabled: ((value: T) => boolean) | null,
    ): void => {
      this.send({
        disabled,
        options,
        type: ComboboxActionType.UpdateVirtualConfiguration,
      });
    },
  };

  readonly selectors = {
    activeDescendantId: (
      state: ComboboxMachineState<T>,
    ): string | undefined => {
      const index = this.selectors.activeOptionIndex(state);
      if (index === null) return undefined;
      if (!state.virtual) return state.options[index]?.id;
      const activeValue = state.virtual.options[index];
      return state.options.find((option) =>
        !option.dataRef.current.disabled &&
        state.dataRef.current.compare(
          option.dataRef.current.value,
          activeValue,
        )
      )?.id;
    },
    activeOption: (state: ComboboxMachineState<T>): T | null => {
      const index = this.selectors.activeOptionIndex(state);
      if (index === null) return null;
      return state.virtual
        ? state.virtual.options[index] ?? null
        : state.options[index]?.dataRef.current.value ?? null;
    },
    activeOptionIndex: (state: ComboboxMachineState<T>): number | null => {
      if (
        state.defaultToFirstOption && state.activeOptionIndex === null &&
        (state.virtual
          ? state.virtual.options.length > 0
          : state.options.length > 0)
      ) {
        if (state.virtual) {
          const index = state.virtual.options.findIndex((option) =>
            !state.virtual!.disabled(option)
          );
          if (index !== -1) return index;
        }
        const index = state.options.findIndex((option) =>
          !option.dataRef.current.disabled
        );
        if (index !== -1) return index;
      }
      return state.activeOptionIndex;
    },
    didInputMove: (state: ComboboxMachineState<T>): boolean =>
      state.inputPositionState.kind === "Moved",
    isActive: (
      state: ComboboxMachineState<T>,
      value: T,
      id: string,
    ): boolean => {
      const index = this.selectors.activeOptionIndex(state);
      if (index === null) return false;
      return state.virtual
        ? index === state.dataRef.current.calculateIndex(value)
        : state.options[index]?.id === id;
    },
    shouldScrollIntoView: (
      state: ComboboxMachineState<T>,
      value: T,
      id: string,
    ): boolean =>
      !state.virtual && !state.__demoMode &&
      state.comboboxState === ComboboxState.Open &&
      state.activationTrigger !== ActivationTrigger.Pointer &&
      this.selectors.isActive(state, value, id),
  };

  reduce(
    readonlyState: Readonly<ComboboxMachineState<T>>,
    action: ComboboxAction<T>,
  ): ComboboxMachineState<T> {
    const state = readonlyState as ComboboxMachineState<T>;

    switch (action.type) {
      case ComboboxActionType.CloseCombobox: {
        if (
          state.dataRef.current.disabled ||
          state.comboboxState === ComboboxState.Closed
        ) return state;
        return {
          ...state,
          __demoMode: false,
          activationTrigger: ActivationTrigger.Other,
          activeOptionIndex: null,
          comboboxState: ComboboxState.Closed,
          inputPositionState: state.inputElement
            ? ElementPositionState.Tracked(
              computeVisualPosition(state.inputElement),
            )
            : state.inputPositionState,
          isTyping: false,
        };
      }
      case ComboboxActionType.OpenCombobox: {
        if (
          state.dataRef.current.disabled ||
          state.comboboxState === ComboboxState.Open
        ) return state;
        const current = state.dataRef.current.value;
        const selected = current === null || current === undefined
          ? -1
          : state.dataRef.current.calculateIndex(current);
        return {
          ...state,
          __demoMode: false,
          activeOptionIndex: selected === -1
            ? state.activeOptionIndex
            : selected,
          comboboxState: ComboboxState.Open,
          inputPositionState: ElementPositionState.Idle,
        };
      }
      case ComboboxActionType.SetTyping:
        return state.isTyping === action.isTyping
          ? state
          : { ...state, isTyping: action.isTyping };
      case ComboboxActionType.GoToOption: {
        if (state.dataRef.current.disabled) return state;
        if (
          state.optionsElement &&
          !state.dataRef.current.optionsPropsRef.current.static &&
          state.comboboxState === ComboboxState.Closed
        ) return state;
        const trigger = action.trigger ?? ActivationTrigger.Other;
        if (state.virtual) {
          const current = state.activeOptionIndex ?? (() => {
            const index = state.virtual!.options.findIndex((option) =>
              !state.virtual!.disabled(option)
            );
            return index === -1 ? null : index;
          })();
          const activeOptionIndex = action.focus === Focus.Specific
            ? action.idx
            : calculateActiveIndex(action, {
              resolveActiveIndex: () => current,
              resolveDisabled: (option) => state.virtual!.disabled(option),
              resolveId: (_option, index) => String(index),
              resolveItems: () => [...state.virtual!.options],
            });
          if (
            state.activeOptionIndex === activeOptionIndex &&
            state.activationTrigger === trigger && !state.isTyping
          ) return state;
          return {
            ...state,
            __demoMode: false,
            activationTrigger: trigger,
            activeOptionIndex,
            isTyping: false,
          };
        }
        const ordered = orderedState(state);
        let current = ordered.activeOptionIndex;
        if (current === null) {
          const first = ordered.options.findIndex((option) =>
            !option.dataRef.current.disabled
          );
          current = first === -1 ? null : first;
        }
        const activeOptionIndex = action.focus === Focus.Specific
          ? action.idx
          : calculateActiveIndex(action, {
            resolveActiveIndex: () => current,
            resolveDisabled: (option) => option.dataRef.current.disabled,
            resolveId: (option) => option.id,
            resolveItems: () => [...ordered.options],
          });
        if (
          state.activeOptionIndex === activeOptionIndex &&
          state.activationTrigger === trigger && !state.isTyping
        ) return state;
        return {
          ...state,
          ...ordered,
          __demoMode: false,
          activationTrigger: trigger,
          activeOptionIndex,
          isTyping: false,
        };
      }
      case ComboboxActionType.RegisterOption: {
        if (state.dataRef.current.virtual) {
          return { ...state, options: [...state.options, action] };
        }
        const option = { id: action.id, dataRef: action.dataRef };
        const ordered = orderedState(state, [...state.options, option]);
        let activeOptionIndex = ordered.activeOptionIndex;
        if (
          activeOptionIndex === null &&
          state.dataRef.current.isSelected(action.dataRef.current.value)
        ) {
          activeOptionIndex = ordered.options.indexOf(option);
        }
        const next = {
          ...state,
          ...ordered,
          activeOptionIndex,
          activationTrigger: ActivationTrigger.Other,
        };
        if (
          state.dataRef.current.__demoMode &&
          state.dataRef.current.value === undefined
        ) next.activeOptionIndex = 0;
        return next;
      }
      case ComboboxActionType.UnregisterOption: {
        if (state.dataRef.current.virtual) {
          return {
            ...state,
            options: state.options.filter((option) => option.id !== action.id),
          };
        }
        return {
          ...state,
          ...orderedState(
            state,
            state.options.filter((option) => option.id !== action.id),
          ),
          activationTrigger: ActivationTrigger.Other,
        };
      }
      case ComboboxActionType.ReorderOptions:
        if (state.virtual) return state;
        return { ...state, ...orderedState(state) };
      case ComboboxActionType.DefaultToFirstOption:
        return state.defaultToFirstOption === action.value
          ? state
          : { ...state, defaultToFirstOption: action.value };
      case ComboboxActionType.SetActivationTrigger:
        return state.activationTrigger === action.trigger
          ? state
          : { ...state, activationTrigger: action.trigger };
      case ComboboxActionType.UpdateVirtualConfiguration: {
        if (action.options === null) {
          return state.virtual === null
            ? state
            : { ...state, activeOptionIndex: null, virtual: null };
        }
        const disabled = action.disabled ?? (() => false);
        if (state.virtual === null) {
          return {
            ...state,
            virtual: { disabled, options: action.options },
          };
        }
        if (
          state.virtual.options === action.options &&
          state.virtual.disabled === action.disabled
        ) return state;
        let activeOptionIndex = state.activeOptionIndex;
        if (activeOptionIndex !== null) {
          const active = state.virtual.options[activeOptionIndex];
          const index = action.options.findIndex((option) =>
            state.dataRef.current.compare(option, active)
          );
          activeOptionIndex = index === -1 ? null : index;
        }
        return {
          ...state,
          activeOptionIndex,
          virtual: { disabled, options: action.options },
        };
      }
      case ComboboxActionType.SetInputElement:
        return state.inputElement === action.element
          ? state
          : { ...state, inputElement: action.element };
      case ComboboxActionType.SetButtonElement:
        return state.buttonElement === action.element
          ? state
          : { ...state, buttonElement: action.element };
      case ComboboxActionType.SetOptionsElement:
        return state.optionsElement === action.element
          ? state
          : { ...state, optionsElement: action.element };
      case ComboboxActionType.MarkInputAsMoved:
        return state.inputPositionState.kind === "Tracked"
          ? { ...state, inputPositionState: ElementPositionState.Moved }
          : state;
    }
  }
}

export function compareComboboxValues<T>(
  by: ByComparator<T> | null | undefined,
  a: T,
  z: T,
): boolean {
  return compareListboxValues(by ?? undefined, a, z);
}
