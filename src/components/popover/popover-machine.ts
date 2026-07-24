import type { Accessor } from "solid-js";
import { Machine } from "../../machine.ts";
import { stackMachines } from "../../machines/stack-machine.ts";
import * as DOM from "../../utils/dom.ts";
import { getFocusableElements } from "../../utils/focus-management.ts";
import { match } from "../../utils/match.ts";
import { getOwnerDocument } from "../../utils/owner.ts";

export enum PopoverStates {
  Open,
  Closed,
}

export interface MutableElementRef<T extends HTMLElement = HTMLElement> {
  current: T | null;
}

export interface PopoverMachineState {
  id: string;
  popoverState: PopoverStates;
  buttons: { current: symbol[] };
  button: HTMLElement | null;
  buttonId: string | null;
  panel: HTMLElement | null;
  panelId: string | null;
  beforePanelSentinel: MutableElementRef<HTMLButtonElement>;
  afterPanelSentinel: MutableElementRef<HTMLButtonElement>;
  afterButtonSentinel: MutableElementRef<HTMLButtonElement>;
  __demoMode: boolean;
}

export enum PopoverActionTypes {
  OpenPopover,
  ClosePopover,
  SetButton,
  SetButtonId,
  SetPanel,
  SetPanelId,
}

export type PopoverActions =
  | { type: PopoverActionTypes.OpenPopover }
  | { type: PopoverActionTypes.ClosePopover }
  | { type: PopoverActionTypes.SetButton; button: HTMLElement | null }
  | { type: PopoverActionTypes.SetButtonId; buttonId: string | null }
  | { type: PopoverActionTypes.SetPanel; panel: HTMLElement | null }
  | { type: PopoverActionTypes.SetPanelId; panelId: string | null };

const reducers: {
  [P in PopoverActionTypes]: (
    state: PopoverMachineState,
    action: Extract<PopoverActions, { type: P }>,
  ) => PopoverMachineState;
} = {
  [PopoverActionTypes.OpenPopover](state) {
    if (state.popoverState === PopoverStates.Open) return state;
    return {
      ...state,
      __demoMode: false,
      popoverState: PopoverStates.Open,
    };
  },
  [PopoverActionTypes.ClosePopover](state) {
    if (state.popoverState === PopoverStates.Closed) return state;
    return {
      ...state,
      __demoMode: false,
      popoverState: PopoverStates.Closed,
    };
  },
  [PopoverActionTypes.SetButton](state, action) {
    return state.button === action.button
      ? state
      : { ...state, button: action.button };
  },
  [PopoverActionTypes.SetButtonId](state, action) {
    return state.buttonId === action.buttonId
      ? state
      : { ...state, buttonId: action.buttonId };
  },
  [PopoverActionTypes.SetPanel](state, action) {
    return state.panel === action.panel
      ? state
      : { ...state, panel: action.panel };
  },
  [PopoverActionTypes.SetPanelId](state, action) {
    return state.panelId === action.panelId
      ? state
      : { ...state, panelId: action.panelId };
  },
};

/**
 * Element, reference, or accessor that can receive focus when the popover closes.
 */
export type PopoverCloseTarget =
  | HTMLElement
  | MutableElementRef
  | Accessor<HTMLElement | null | undefined>
  | Event
  | null
  | undefined;

function resolveCloseTarget(target: PopoverCloseTarget): HTMLElement | null {
  if (!target) return null;
  if (DOM.isHTMLElement(target)) return target;
  if (typeof target === "function") return target() ?? null;
  if ("current" in target && DOM.isHTMLElement(target.current)) {
    return target.current;
  }
  return null;
}

export class PopoverMachine extends Machine<
  PopoverMachineState,
  PopoverActions
> {
  static create(
    { id, __demoMode = false }: { id: string; __demoMode?: boolean },
  ): PopoverMachine {
    return new PopoverMachine({
      id,
      __demoMode,
      afterButtonSentinel: { current: null },
      afterPanelSentinel: { current: null },
      beforePanelSentinel: { current: null },
      button: null,
      buttonId: null,
      buttons: { current: [] },
      panel: null,
      panelId: null,
      popoverState: __demoMode ? PopoverStates.Open : PopoverStates.Closed,
    });
  }

  constructor(initialState: PopoverMachineState) {
    super(initialState);
    const id = initialState.id;
    const stack = stackMachines.get(null);
    this.on(PopoverActionTypes.OpenPopover, () => stack.actions.push(id));
    this.on(PopoverActionTypes.ClosePopover, () => stack.actions.pop(id));
    this.disposables.add(() => stack.actions.pop(id));
  }

  reduce(
    state: Readonly<PopoverMachineState>,
    action: PopoverActions,
  ): PopoverMachineState {
    return match(action.type, reducers, state, action);
  }

  actions = {
    close: () => this.send({ type: PopoverActionTypes.ClosePopover }),
    open: () => this.send({ type: PopoverActionTypes.OpenPopover }),
    refocusableClose: (target?: PopoverCloseTarget) => {
      this.actions.close();
      (resolveCloseTarget(target) ?? this.state.button)?.focus();
    },
    setButton: (button: HTMLElement | null) =>
      this.send({ type: PopoverActionTypes.SetButton, button }),
    setButtonId: (buttonId: string | null) =>
      this.send({ type: PopoverActionTypes.SetButtonId, buttonId }),
    setPanel: (panel: HTMLElement | null) =>
      this.send({ type: PopoverActionTypes.SetPanel, panel }),
    setPanelId: (panelId: string | null) =>
      this.send({ type: PopoverActionTypes.SetPanelId, panelId }),
  };

  selectors = {
    isPortalled: (state: PopoverMachineState): boolean => {
      if (!state.button || !state.panel) return false;
      const ownerDocument = getOwnerDocument(state.button);
      if (!ownerDocument) return false;

      for (const root of ownerDocument.querySelectorAll("body > *")) {
        if (
          Number(root.contains(state.button)) ^
          Number(root.contains(state.panel))
        ) {
          return true;
        }
      }

      const elements = getFocusableElements(ownerDocument);
      const buttonIndex = elements.indexOf(state.button);
      if (buttonIndex === -1 || elements.length === 0) return false;
      const before = elements[
        (buttonIndex + elements.length - 1) % elements.length
      ];
      const after = elements[(buttonIndex + 1) % elements.length];
      return !state.panel.contains(before) && !state.panel.contains(after);
    },
  };
}
