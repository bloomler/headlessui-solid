import {
  type Accessor,
  createEffect,
  createSignal,
  createUniqueId,
  onSettled,
} from "solid-js";
import { stackMachines } from "../machines/stack-machine.ts";
import { createEventListener } from "./events.ts";

type LayerSlice = readonly [isTop: boolean, inStack: boolean];

export function createIsTopLayer(
  enabled: Accessor<boolean>,
  scope: string | null,
): Accessor<boolean> {
  const id = `headlessui-layer-${createUniqueId()}`;
  const machine = stackMachines.get(scope);
  const select = (state: Parameters<typeof machine.selectors.isTop>[0]) =>
    [
      machine.selectors.isTop(state, id),
      machine.selectors.inStack(state, id),
    ] as const;
  const [slice, setSlice] = createSignal<LayerSlice>(select(machine.state));

  onSettled(() => machine.subscribe(select, setSlice));
  createEffect(
    enabled,
    (isEnabled) => {
      if (!isEnabled) return;
      machine.actions.push(id);
      return () => machine.actions.pop(id);
    },
  );

  return () => {
    if (!enabled()) return false;
    const [isTop, inStack] = slice();
    return inStack ? isTop : true;
  };
}

export function createEscape(
  enabled: Accessor<boolean>,
  view: Accessor<Window | null>,
  callback: (event: KeyboardEvent) => void,
): void {
  const isTopLayer = createIsTopLayer(enabled, "escape");

  createEventListener(
    view,
    "keydown",
    (event: KeyboardEvent) => {
      if (!isTopLayer()) return;
      if (event.defaultPrevented || event.key !== "Escape") return;
      callback(event);
    },
  );
}
