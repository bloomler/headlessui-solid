import { batch, Machine } from "../../machine.ts";
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
import { match } from "../../utils/match.ts";

export enum MenuState {
  Open,
  Closed,
}

export enum ActivationTrigger {
  Pointer,
  Other,
}

export interface MenuItemDataRef {
  current: {
    disabled: boolean;
    domRef: { current: HTMLElement | null };
    readonly textValue?: string;
  };
}

export interface MenuItemRecord {
  dataRef: MenuItemDataRef;
  id: string;
}

type PendingFocus =
  | { focus: Exclude<Focus, Focus.Specific> }
  | { focus: Focus.Specific; id: string };

export interface MenuMachineState {
  readonly __demoMode: boolean;
  readonly activationTrigger: ActivationTrigger;
  readonly activeItemIndex: number | null;
  readonly buttonElement: HTMLElement | null;
  readonly buttonPositionState: ElementPositionStateType;
  readonly id: string;
  readonly items: readonly MenuItemRecord[];
  readonly itemsElement: HTMLElement | null;
  readonly menuState: MenuState;
  readonly pendingFocus: PendingFocus;
  readonly pendingShouldSort: boolean;
  readonly searchQuery: string;
}

export enum MenuActionType {
  OpenMenu,
  CloseMenu,
  GoToItem,
  Search,
  ClearSearch,
  RegisterItems,
  UnregisterItems,
  SetButtonElement,
  SetItemsElement,
  SortItems,
  MarkButtonAsMoved,
}

export type MenuAction =
  | { type: MenuActionType.CloseMenu }
  | {
    focus: PendingFocus;
    trigger?: ActivationTrigger;
    type: MenuActionType.OpenMenu;
  }
  | {
    focus: Focus.Specific;
    id: string;
    trigger?: ActivationTrigger;
    type: MenuActionType.GoToItem;
  }
  | {
    focus: Exclude<Focus, Focus.Specific>;
    trigger?: ActivationTrigger;
    type: MenuActionType.GoToItem;
  }
  | { type: MenuActionType.Search; value: string }
  | { type: MenuActionType.ClearSearch }
  | { items: MenuItemRecord[]; type: MenuActionType.RegisterItems }
  | { items: string[]; type: MenuActionType.UnregisterItems }
  | { element: HTMLElement | null; type: MenuActionType.SetButtonElement }
  | { element: HTMLElement | null; type: MenuActionType.SetItemsElement }
  | { type: MenuActionType.SortItems }
  | { type: MenuActionType.MarkButtonAsMoved };

function adjustOrderedState(
  state: MenuMachineState,
  adjustment: (items: MenuItemRecord[]) => MenuItemRecord[] = (items) => items,
): Pick<MenuMachineState, "activeItemIndex" | "items"> {
  const current = state.activeItemIndex === null
    ? null
    : state.items[state.activeItemIndex] ?? null;
  const items = sortByDomNode(
    adjustment([...state.items]),
    (item) => item.dataRef.current.domRef.current,
  );
  const nextIndex = current === null ? null : items.indexOf(current);
  return {
    items,
    activeItemIndex: nextIndex === -1 ? null : nextIndex,
  };
}

function resolveActiveIndex(
  state: Pick<MenuMachineState, "activeItemIndex" | "items">,
  action: { focus: Focus; id?: string },
): number | null {
  return calculateActiveIndex(action as never, {
    resolveItems: () => state.items as MenuItemRecord[],
    resolveActiveIndex: () => state.activeItemIndex,
    resolveId: (item) => item.id,
    resolveDisabled: (item) => item.dataRef.current.disabled,
  });
}

const reducers: {
  [Type in MenuActionType]: (
    state: MenuMachineState,
    action: Extract<MenuAction, { type: Type }>,
  ) => MenuMachineState;
} = {
  [MenuActionType.CloseMenu](state) {
    if (state.menuState === MenuState.Closed) return state;
    const buttonPositionState = state.buttonElement
      ? ElementPositionState.Tracked(
        computeVisualPosition(state.buttonElement),
      )
      : state.buttonPositionState;
    return {
      ...state,
      activeItemIndex: null,
      buttonPositionState,
      menuState: MenuState.Closed,
      pendingFocus: { focus: Focus.Nothing },
    };
  },
  [MenuActionType.OpenMenu](state, action) {
    if (state.menuState === MenuState.Open) return state;
    const hasRegisteredItems = state.items.length > 0;
    const activeItemIndex = hasRegisteredItems &&
        action.focus.focus !== Focus.Nothing
      ? resolveActiveIndex(state, action.focus)
      : state.activeItemIndex;
    return {
      ...state,
      __demoMode: false,
      activeItemIndex,
      buttonPositionState: ElementPositionState.Idle,
      menuState: MenuState.Open,
      pendingFocus: hasRegisteredItems
        ? { focus: Focus.Nothing }
        : action.focus,
    };
  },
  [MenuActionType.GoToItem](state, action) {
    if (state.menuState === MenuState.Closed) return state;
    const base = {
      ...state,
      __demoMode: false,
      activationTrigger: action.trigger ?? ActivationTrigger.Other,
      pendingFocus: { focus: Focus.Nothing } as const,
      searchQuery: "",
    };

    if (action.focus === Focus.Nothing) {
      return { ...base, activeItemIndex: null };
    }
    if (action.focus === Focus.Specific) {
      const activeItemIndex = state.items.findIndex((item) =>
        item.id === action.id
      );
      return {
        ...base,
        activeItemIndex: activeItemIndex === -1 ? null : activeItemIndex,
      };
    }

    if (action.focus === Focus.Previous && state.activeItemIndex !== null) {
      const current = state.items[state.activeItemIndex]?.dataRef.current.domRef
        .current;
      const previousIndex = resolveActiveIndex(state, action);
      const previous = previousIndex === null
        ? null
        : state.items[previousIndex]?.dataRef.current.domRef.current;
      if (
        previousIndex !== null &&
        (current?.previousElementSibling === previous ||
          previous?.previousElementSibling === null)
      ) {
        return { ...base, activeItemIndex: previousIndex };
      }
    }

    if (action.focus === Focus.Next && state.activeItemIndex !== null) {
      const current = state.items[state.activeItemIndex]?.dataRef.current.domRef
        .current;
      const nextIndex = resolveActiveIndex(state, action);
      const next = nextIndex === null
        ? null
        : state.items[nextIndex]?.dataRef.current.domRef.current;
      if (
        nextIndex !== null &&
        (current?.nextElementSibling === next ||
          next?.nextElementSibling === null)
      ) {
        return { ...base, activeItemIndex: nextIndex };
      }
    }

    const ordered = adjustOrderedState(state);
    return {
      ...base,
      ...ordered,
      activeItemIndex: resolveActiveIndex(ordered, action),
    };
  },
  [MenuActionType.Search](state, action) {
    const wasSearching = state.searchQuery !== "";
    const offset = wasSearching ? 0 : 1;
    const searchQuery = state.searchQuery + action.value.toLowerCase();
    const ordered = state.activeItemIndex === null
      ? state.items
      : state.items.slice(state.activeItemIndex + offset).concat(
        state.items.slice(0, state.activeItemIndex + offset),
      );
    const match = ordered.find((item) =>
      item.dataRef.current.textValue?.toLowerCase().startsWith(searchQuery) &&
      !item.dataRef.current.disabled
    );
    const activeItemIndex = match ? state.items.indexOf(match) : -1;
    if (activeItemIndex === -1 || activeItemIndex === state.activeItemIndex) {
      return { ...state, searchQuery };
    }
    return {
      ...state,
      activationTrigger: ActivationTrigger.Other,
      activeItemIndex,
      searchQuery,
    };
  },
  [MenuActionType.ClearSearch](state) {
    return state.searchQuery === "" ? state : { ...state, searchQuery: "" };
  },
  [MenuActionType.RegisterItems](state, action) {
    const items = [...state.items, ...action.items];
    const activeItemIndex = state.pendingFocus.focus === Focus.Nothing
      ? state.activeItemIndex
      : resolveActiveIndex(
        { activeItemIndex: state.activeItemIndex, items },
        state.pendingFocus,
      );
    return {
      ...state,
      activeItemIndex,
      items,
      // Solid can settle sibling MenuItem owners independently. Keep the
      // opening intent while the collection grows; the registration-frame
      // sort resolves it once more against final DOM order and clears it.
      pendingFocus: state.pendingFocus,
      pendingShouldSort: true,
    };
  },
  [MenuActionType.UnregisterItems](state, action) {
    const ids = new Set(action.items);
    if (!state.items.some((item) => ids.has(item.id))) return state;
    const activeItem = state.activeItemIndex === null
      ? null
      : state.items[state.activeItemIndex] ?? null;
    const items = state.items.filter((item) => !ids.has(item.id));
    const activeItemIndex = activeItem === null
      ? null
      : items.indexOf(activeItem);
    return {
      ...state,
      activationTrigger: ActivationTrigger.Other,
      activeItemIndex: activeItemIndex === -1 ? null : activeItemIndex,
      items,
    };
  },
  [MenuActionType.SetButtonElement](state, action) {
    return state.buttonElement === action.element
      ? state
      : { ...state, buttonElement: action.element };
  },
  [MenuActionType.SetItemsElement](state, action) {
    return state.itemsElement === action.element
      ? state
      : { ...state, itemsElement: action.element };
  },
  [MenuActionType.SortItems](state) {
    if (!state.pendingShouldSort) return state;
    const ordered = adjustOrderedState(state);
    const activeItemIndex = state.pendingFocus.focus === Focus.Nothing
      ? ordered.activeItemIndex
      : resolveActiveIndex(ordered, state.pendingFocus);
    return {
      ...state,
      ...ordered,
      activeItemIndex,
      pendingFocus: { focus: Focus.Nothing },
      pendingShouldSort: false,
    };
  },
  [MenuActionType.MarkButtonAsMoved](state) {
    return state.buttonPositionState.kind === "Tracked"
      ? { ...state, buttonPositionState: ElementPositionState.Moved }
      : state;
  },
};

export class MenuMachine extends Machine<MenuMachineState, MenuAction> {
  static create(
    { id, __demoMode = false }: { id: string; __demoMode?: boolean },
  ): MenuMachine {
    return new MenuMachine({
      __demoMode,
      activationTrigger: ActivationTrigger.Other,
      activeItemIndex: null,
      buttonElement: null,
      buttonPositionState: ElementPositionState.Idle,
      id,
      items: [],
      itemsElement: null,
      menuState: __demoMode ? MenuState.Open : MenuState.Closed,
      pendingFocus: { focus: Focus.Nothing },
      pendingShouldSort: false,
      searchQuery: "",
    });
  }

  constructor(initialState: MenuMachineState) {
    super(initialState);

    this.on(MenuActionType.RegisterItems, () => {
      this.disposables.requestAnimationFrame(() => {
        this.send({ type: MenuActionType.SortItems });
      });
    });

    const id = this.state.id;
    const stack = stackMachines.get(null);
    this.disposables.add(
      stack.on(StackActionTypes.Push, (state) => {
        if (
          !stack.selectors.isTop(state, id) &&
          this.state.menuState === MenuState.Open
        ) {
          this.send({ type: MenuActionType.CloseMenu });
        }
      }),
    );
    this.on(MenuActionType.OpenMenu, () => stack.actions.push(id));
    this.on(MenuActionType.CloseMenu, () => stack.actions.pop(id));
    this.disposables.add(() => stack.actions.pop(id));

    this.disposables.group((cleanup) => {
      this.on(MenuActionType.CloseMenu, (state) => {
        if (!state.buttonElement) return;
        cleanup.dispose();
        cleanup.add(
          detectMovement(
            state.buttonElement,
            state.buttonPositionState,
            () => this.send({ type: MenuActionType.MarkButtonAsMoved }),
          ),
        );
      });
    });
  }

  reduce(
    state: Readonly<MenuMachineState>,
    action: MenuAction,
  ): MenuMachineState {
    return match(action.type, reducers, state, action);
  }

  actions = {
    registerItem: batch(() => {
      const items: MenuItemRecord[] = [];
      const seen = new Set<MenuItemDataRef>();
      return [
        (id: string, dataRef: MenuItemDataRef) => {
          if (seen.has(dataRef)) return;
          seen.add(dataRef);
          items.push({ dataRef, id });
        },
        () => {
          seen.clear();
          this.send({
            items: items.splice(0),
            type: MenuActionType.RegisterItems,
          });
        },
      ];
    }),
    unregisterItem: batch(() => {
      const items: string[] = [];
      return [
        (id: string) => items.push(id),
        () =>
          this.send({
            items: items.splice(0),
            type: MenuActionType.UnregisterItems,
          }),
      ];
    }),
  };

  selectors = {
    activeDescendantId(state: MenuMachineState): string | undefined {
      return state.activeItemIndex === null
        ? undefined
        : state.items[state.activeItemIndex]?.id;
    },
    didButtonMove(state: MenuMachineState): boolean {
      return state.buttonPositionState.kind === "Moved";
    },
    isActive(state: MenuMachineState, id: string): boolean {
      return state.activeItemIndex === null
        ? false
        : state.items[state.activeItemIndex]?.id === id;
    },
    shouldScrollIntoView(state: MenuMachineState, id: string): boolean {
      if (state.__demoMode || state.menuState !== MenuState.Open) return false;
      if (state.activationTrigger === ActivationTrigger.Pointer) return false;
      return this.isActive(state, id);
    },
  };
}
