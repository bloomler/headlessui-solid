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

export type ByComparator<T> =
  | (NonNullable<T> extends never ? string
    : keyof NonNullable<T> & string)
  | ((a: T, z: T) => boolean);

function propertyValue(value: unknown, property: string): unknown {
  if (value === null || value === undefined) return undefined;
  return (Object(value) as Record<string, unknown>)[property];
}

export function compareListboxValues<T>(
  by: ByComparator<T> | undefined,
  a: T,
  z: T,
): boolean {
  if (typeof by === "string") {
    return propertyValue(a, by) === propertyValue(z, by);
  }
  if (typeof by === "function") return by(a, z);
  if (
    a !== null && z !== null && typeof a === "object" &&
    typeof z === "object" && "id" in a && "id" in z
  ) {
    return a.id === z.id;
  }
  return a === z;
}

export function toggleListboxValue<T>(
  values: readonly T[],
  value: T,
  compare: (a: T, z: T) => boolean,
): T[] {
  const next = [...values];
  const index = next.findIndex((item) => compare(item, value));
  if (index === -1) next.push(value);
  else next.splice(index, 1);
  return next;
}

export enum ListboxState {
  Open,
  Closed,
}

export enum ValueMode {
  Single,
  Multi,
}

export enum ActivationTrigger {
  Pointer,
  Other,
}

export interface MutableRef<T> {
  current: T;
}

export interface ListboxOptionData<T> {
  disabled: boolean;
  readonly domRef: MutableRef<HTMLElement | null>;
  readonly textValue?: string;
  value: T;
}

export interface ListboxOptionDataRef<T> {
  current: ListboxOptionData<T>;
}

export interface ListboxOptionRecord<T> {
  readonly dataRef: ListboxOptionDataRef<T>;
  readonly id: string;
}

export interface ListboxMachineData<T> {
  readonly compare: (a: T, z: T) => boolean;
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly isSelected: (value: T) => boolean;
  readonly listRef: MutableRef<Map<string, HTMLElement | null>>;
  readonly mode: ValueMode;
  readonly onChange: (value: T | T[]) => void;
  readonly optionsPropsRef: MutableRef<{ hold: boolean; static: boolean }>;
  readonly orientation: "horizontal" | "vertical";
  readonly value: T | readonly T[] | undefined;
}

type PendingFocus =
  | { focus: Exclude<Focus, Focus.Specific> }
  | { focus: Focus.Specific; id: string };

export interface ListboxMachineState<T> {
  readonly __demoMode: boolean;
  readonly activationTrigger: ActivationTrigger;
  readonly activeOptionIndex: number | null;
  readonly buttonElement: HTMLButtonElement | null;
  readonly buttonPositionState: ElementPositionStateType;
  readonly dataRef: MutableRef<ListboxMachineData<T>>;
  readonly frozenValue: boolean;
  readonly frozenSelection: T | readonly T[] | undefined;
  readonly id: string;
  readonly listboxState: ListboxState;
  readonly options: readonly ListboxOptionRecord<T>[];
  readonly optionsElement: HTMLElement | null;
  readonly pendingFocus: PendingFocus;
  readonly pendingShouldSort: boolean;
  readonly searchQuery: string;
}

export enum ListboxActionType {
  OpenListbox,
  CloseListbox,
  GoToOption,
  Search,
  ClearSearch,
  SelectOption,
  RegisterOption,
  UnregisterOption,
  SetButtonElement,
  SetOptionsElement,
  SortOptions,
  MarkButtonAsMoved,
}

export type ListboxAction<T> =
  | { type: ListboxActionType.CloseListbox }
  | { focus: PendingFocus; type: ListboxActionType.OpenListbox }
  | {
    focus: Focus.Specific;
    id: string;
    trigger?: ActivationTrigger;
    type: ListboxActionType.GoToOption;
  }
  | {
    focus: Exclude<Focus, Focus.Specific>;
    trigger?: ActivationTrigger;
    type: ListboxActionType.GoToOption;
  }
  | { type: ListboxActionType.Search; value: string }
  | { type: ListboxActionType.ClearSearch }
  | { type: ListboxActionType.SelectOption; value: T }
  | {
    dataRef: ListboxOptionDataRef<T>;
    id: string;
    type: ListboxActionType.RegisterOption;
  }
  | { id: string; type: ListboxActionType.UnregisterOption }
  | {
    element: HTMLButtonElement | null;
    type: ListboxActionType.SetButtonElement;
  }
  | {
    element: HTMLElement | null;
    type: ListboxActionType.SetOptionsElement;
  }
  | { type: ListboxActionType.SortOptions }
  | { type: ListboxActionType.MarkButtonAsMoved };

function orderedState<T>(
  state: ListboxMachineState<T>,
  options: readonly ListboxOptionRecord<T>[] = state.options,
): Pick<ListboxMachineState<T>, "activeOptionIndex" | "options"> {
  const active = state.activeOptionIndex === null
    ? null
    : state.options[state.activeOptionIndex] ?? null;
  const sorted = sortByDomNode(
    [...options],
    (option) => option.dataRef.current.domRef.current,
  );
  const index = active === null ? null : sorted.indexOf(active);
  return {
    options: sorted,
    activeOptionIndex: index === -1 ? null : index,
  };
}

function resolveActiveIndex<T>(
  state: Pick<ListboxMachineState<T>, "activeOptionIndex" | "options">,
  focus: PendingFocus,
): number | null {
  return calculateActiveIndex(focus, {
    resolveItems: () => [...state.options],
    resolveActiveIndex: () => state.activeOptionIndex,
    resolveId: (option) => option.id,
    resolveDisabled: (option) => option.dataRef.current.disabled,
  });
}

function defaultData<T>(): ListboxMachineData<T> {
  return {
    compare: (a, z) => a === z,
    disabled: false,
    invalid: false,
    isSelected: () => false,
    listRef: { current: new Map() },
    mode: ValueMode.Single,
    onChange: () => {},
    optionsPropsRef: { current: { hold: false, static: false } },
    orientation: "vertical",
    value: undefined,
  };
}

export class ListboxMachine<T> extends Machine<
  ListboxMachineState<T>,
  ListboxAction<T>
> {
  static create<T>(options: {
    __demoMode?: boolean;
    id: string;
  }): ListboxMachine<T> {
    const demo = options.__demoMode ?? false;
    return new ListboxMachine<T>({
      __demoMode: demo,
      activationTrigger: ActivationTrigger.Other,
      activeOptionIndex: null,
      buttonElement: null,
      buttonPositionState: ElementPositionState.Idle,
      dataRef: { current: defaultData<T>() },
      frozenValue: false,
      frozenSelection: undefined,
      id: options.id,
      listboxState: demo ? ListboxState.Open : ListboxState.Closed,
      options: [],
      optionsElement: null,
      pendingFocus: { focus: Focus.Nothing },
      pendingShouldSort: false,
      searchQuery: "",
    });
  }

  constructor(initialState: ListboxMachineState<T>) {
    super(initialState);

    this.on(ListboxActionType.RegisterOption, () => {
      if (typeof requestAnimationFrame !== "function") return;
      this.disposables.requestAnimationFrame(() => this.actions.sortOptions());
    });

    const id = this.state.id;
    const stack = stackMachines.get(null);
    this.disposables.add(
      stack.on(StackActionTypes.Push, (state) => {
        if (
          !stack.selectors.isTop(state, id) &&
          this.state.listboxState === ListboxState.Open
        ) {
          this.actions.closeListbox();
        }
      }),
    );
    this.on(ListboxActionType.OpenListbox, () => stack.actions.push(id));
    this.on(ListboxActionType.CloseListbox, () => stack.actions.pop(id));
    this.disposables.add(() => stack.actions.pop(id));

    this.disposables.group((cleanup) => {
      this.on(ListboxActionType.CloseListbox, (state) => {
        if (!state.buttonElement) return;
        cleanup.dispose();
        cleanup.add(
          detectMovement(
            state.buttonElement,
            state.buttonPositionState,
            () => this.send({ type: ListboxActionType.MarkButtonAsMoved }),
          ),
        );
      });
    });

    this.on(ListboxActionType.SelectOption, (_, action) => {
      this.actions.change(action.value);
      if (this.state.dataRef.current.mode === ValueMode.Single) {
        this.actions.closeListbox();
        this.state.buttonElement?.focus({ preventScroll: true });
      }
    });
  }

  readonly actions = {
    change: (value: T): void => {
      const data = this.state.dataRef.current;
      if (data.mode === ValueMode.Single) {
        data.onChange(value);
        return;
      }
      data.onChange(
        toggleListboxValue(
          Array.isArray(data.value) ? data.value : [],
          value,
          data.compare,
        ),
      );
    },
    clearSearch: (): void => {
      this.send({ type: ListboxActionType.ClearSearch });
    },
    closeListbox: (): void => {
      this.send({ type: ListboxActionType.CloseListbox });
    },
    goToOption: (
      focus: PendingFocus,
      trigger?: ActivationTrigger,
    ): void => {
      this.send({
        type: ListboxActionType.GoToOption,
        ...focus,
        trigger,
      } as ListboxAction<T>);
    },
    openListbox: (focus: PendingFocus): void => {
      this.send({ type: ListboxActionType.OpenListbox, focus });
    },
    registerOption: (
      id: string,
      dataRef: ListboxOptionDataRef<T>,
    ): void => {
      this.send({ type: ListboxActionType.RegisterOption, id, dataRef });
    },
    search: (value: string): void => {
      this.send({ type: ListboxActionType.Search, value });
    },
    selectActiveOption: (): void => {
      const index = this.state.activeOptionIndex;
      if (index !== null) {
        const option = this.state.options[index];
        if (option) this.actions.selectOption(option.dataRef.current.value);
      } else if (this.state.dataRef.current.mode === ValueMode.Single) {
        this.actions.closeListbox();
        this.state.buttonElement?.focus({ preventScroll: true });
      }
    },
    selectOption: (value: T): void => {
      this.send({ type: ListboxActionType.SelectOption, value });
    },
    setButtonElement: (element: HTMLButtonElement | null): void => {
      this.send({ type: ListboxActionType.SetButtonElement, element });
    },
    setOptionsElement: (element: HTMLElement | null): void => {
      this.send({ type: ListboxActionType.SetOptionsElement, element });
    },
    sortOptions: (): void => {
      this.send({ type: ListboxActionType.SortOptions });
    },
    unregisterOption: (id: string): void => {
      this.send({ type: ListboxActionType.UnregisterOption, id });
    },
  };

  readonly selectors = {
    activeDescendantId: (state: ListboxMachineState<T>): string | undefined => {
      const index = state.activeOptionIndex;
      return index === null ? undefined : state.options[index]?.id;
    },
    didButtonMove: (state: ListboxMachineState<T>): boolean =>
      state.buttonPositionState.kind === "Moved",
    hasFrozenValue: (state: ListboxMachineState<T>): boolean =>
      state.frozenValue,
    isActive: (state: ListboxMachineState<T>, id: string): boolean => {
      const index = state.activeOptionIndex;
      return index !== null && state.options[index]?.id === id;
    },
    shouldScrollIntoView: (
      state: ListboxMachineState<T>,
      id: string,
    ): boolean =>
      !state.__demoMode && state.listboxState === ListboxState.Open &&
      state.activationTrigger !== ActivationTrigger.Pointer &&
      this.selectors.isActive(state, id),
  };

  reduce(
    readonlyState: Readonly<ListboxMachineState<T>>,
    action: ListboxAction<T>,
  ): ListboxMachineState<T> {
    const state = readonlyState as ListboxMachineState<T>;

    switch (action.type) {
      case ListboxActionType.CloseListbox: {
        if (
          state.dataRef.current.disabled ||
          state.listboxState === ListboxState.Closed
        ) return state;
        return {
          ...state,
          __demoMode: false,
          activeOptionIndex: null,
          buttonPositionState: state.buttonElement
            ? ElementPositionState.Tracked(
              computeVisualPosition(state.buttonElement),
            )
            : state.buttonPositionState,
          listboxState: ListboxState.Closed,
          pendingFocus: { focus: Focus.Nothing },
        };
      }
      case ListboxActionType.OpenListbox: {
        if (
          state.dataRef.current.disabled ||
          state.listboxState === ListboxState.Open
        ) return state;
        const selected = state.options.findIndex((option) =>
          state.dataRef.current.isSelected(option.dataRef.current.value)
        );
        const hasRegisteredOptions = state.options.length > 0;
        const activeOptionIndex = selected !== -1
          ? selected
          : hasRegisteredOptions && action.focus.focus !== Focus.Nothing
          ? resolveActiveIndex(state, action.focus)
          : state.activeOptionIndex;
        return {
          ...state,
          __demoMode: false,
          activeOptionIndex,
          buttonPositionState: ElementPositionState.Idle,
          frozenSelection: undefined,
          frozenValue: false,
          listboxState: ListboxState.Open,
          pendingFocus: hasRegisteredOptions || selected !== -1
            ? { focus: Focus.Nothing }
            : action.focus,
        };
      }
      case ListboxActionType.GoToOption: {
        if (
          state.dataRef.current.disabled ||
          state.listboxState === ListboxState.Closed
        ) return state;
        const ordered = orderedState(state);
        return {
          ...state,
          ...ordered,
          __demoMode: false,
          activationTrigger: action.trigger ?? ActivationTrigger.Other,
          activeOptionIndex: resolveActiveIndex(ordered, action),
          pendingFocus: { focus: Focus.Nothing },
          searchQuery: "",
        };
      }
      case ListboxActionType.Search: {
        if (
          state.dataRef.current.disabled ||
          state.listboxState === ListboxState.Closed
        ) return state;
        const searching = state.searchQuery !== "";
        const offset = searching ? 0 : 1;
        const query = state.searchQuery + action.value.toLowerCase();
        const ordered = state.activeOptionIndex === null ? state.options : [
          ...state.options.slice(state.activeOptionIndex + offset),
          ...state.options.slice(0, state.activeOptionIndex + offset),
        ];
        const match = ordered.find((option) =>
          !option.dataRef.current.disabled &&
          option.dataRef.current.textValue?.toLowerCase().startsWith(query)
        );
        const index = match ? state.options.indexOf(match) : -1;
        return index === -1 || index === state.activeOptionIndex
          ? { ...state, searchQuery: query }
          : {
            ...state,
            activationTrigger: ActivationTrigger.Other,
            activeOptionIndex: index,
            searchQuery: query,
          };
      }
      case ListboxActionType.ClearSearch:
        if (
          state.dataRef.current.disabled ||
          state.listboxState === ListboxState.Closed ||
          state.searchQuery === ""
        ) return state;
        return { ...state, searchQuery: "" };
      case ListboxActionType.SelectOption:
        return state.dataRef.current.mode === ValueMode.Single
          ? {
            ...state,
            frozenSelection: state.dataRef.current.value,
            frozenValue: true,
          }
          : { ...state };
      case ListboxActionType.RegisterOption: {
        if (state.options.some((option) => option.dataRef === action.dataRef)) {
          return state;
        }
        const options = [...state.options, {
          id: action.id,
          dataRef: action.dataRef,
        }];
        let activeOptionIndex = state.activeOptionIndex;
        if (state.pendingFocus.focus !== Focus.Nothing) {
          activeOptionIndex = resolveActiveIndex(
            { activeOptionIndex, options },
            state.pendingFocus,
          );
        } else if (activeOptionIndex === null) {
          const selected = options.findIndex((option) =>
            state.dataRef.current.isSelected(option.dataRef.current.value)
          );
          if (selected !== -1) activeOptionIndex = selected;
        }
        return {
          ...state,
          activeOptionIndex,
          options,
          // Options mount one at a time. Preserve the opening intent until the
          // registration frame settles so Focus.Last can follow the growing
          // collection and Focus.First can skip an initially disabled option.
          pendingFocus: state.pendingFocus,
          pendingShouldSort: true,
        };
      }
      case ListboxActionType.UnregisterOption: {
        const next = state.options.filter((option) => option.id !== action.id);
        if (next.length === state.options.length) return state;
        return {
          ...state,
          ...orderedState(state, next),
          activationTrigger: ActivationTrigger.Other,
        };
      }
      case ListboxActionType.SetButtonElement:
        return state.buttonElement === action.element
          ? state
          : { ...state, buttonElement: action.element };
      case ListboxActionType.SetOptionsElement:
        return state.optionsElement === action.element
          ? state
          : { ...state, optionsElement: action.element };
      case ListboxActionType.SortOptions: {
        const ordered = orderedState(state);
        const changed = ordered.activeOptionIndex !==
            state.activeOptionIndex ||
          ordered.options.some((option, index) =>
            state.options[index] !== option
          );
        return changed || state.pendingShouldSort
          ? {
            ...state,
            ...ordered,
            pendingFocus: { focus: Focus.Nothing },
            pendingShouldSort: false,
          }
          : state;
      }
      case ListboxActionType.MarkButtonAsMoved:
        return state.buttonPositionState.kind === "Tracked"
          ? {
            ...state,
            buttonPositionState: ElementPositionState.Moved,
          }
          : state;
    }
  }
}
