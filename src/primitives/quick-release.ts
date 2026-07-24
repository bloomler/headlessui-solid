import type { Accessor } from "solid-js";
import * as DOM from "../utils/dom.ts";
import { createDocumentEvent } from "./events.ts";

const POINTER_HOLD_THRESHOLD = 200;
const POINTER_MOVEMENT_THRESHOLD = 5;

export const QuickReleaseAction = {
  Close: { kind: "close" } as const,
  Ignore: { kind: "ignore" } as const,
  Select: (target: HTMLElement) => ({ kind: "select", target }) as const,
};

type QuickReleaseResult =
  | typeof QuickReleaseAction.Close
  | typeof QuickReleaseAction.Ignore
  | ReturnType<typeof QuickReleaseAction.Select>;

type PointerEventWithTarget = PointerEvent & {
  target: HTMLOrSVGElement & Element;
};

export function createQuickRelease(
  enabled: Accessor<boolean>,
  {
    action,
    close,
    owner,
    select,
    trigger,
  }: {
    action: (event: PointerEventWithTarget) => QuickReleaseResult;
    close: () => void;
    owner: Accessor<Document | null>;
    select: (target: HTMLElement) => void;
    trigger: Accessor<HTMLElement | null>;
  },
): (event: PointerEvent) => void {
  let started: { at: number; x: number; y: number } | null = null;
  const active = () => enabled() && trigger() !== null;

  createDocumentEvent(
    active,
    "pointerup",
    (event) => {
      const currentStart = started;
      started = null;
      if (!currentStart || !DOM.isHTMLorSVGElement(event.target)) return;

      if (
        Math.abs(event.clientX - currentStart.x) <
          POINTER_MOVEMENT_THRESHOLD &&
        Math.abs(event.clientY - currentStart.y) <
          POINTER_MOVEMENT_THRESHOLD
      ) {
        return;
      }

      const result = action(event as PointerEventWithTarget);
      switch (result.kind) {
        case "ignore":
          return;
        case "select":
          if (event.timeStamp - currentStart.at > POINTER_HOLD_THRESHOLD) {
            select(result.target);
            close();
          }
          return;
        case "close":
          close();
      }
    },
    true,
    owner,
  );

  return (event) => {
    const currentTrigger = trigger();
    if (
      !currentTrigger ||
      !DOM.isNode(event.target) ||
      !currentTrigger.contains(event.target)
    ) {
      return;
    }

    started = {
      at: event.timeStamp,
      x: event.clientX,
      y: event.clientY,
    };
  };
}
