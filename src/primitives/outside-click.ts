import type { Accessor } from "solid-js";
import * as DOM from "../utils/dom.ts";
import {
  FocusableMode,
  isFocusableElement,
} from "../utils/focus-management.ts";
import { isMobile } from "../utils/platform.ts";
import { createDocumentEvent, createWindowEvent } from "./events.ts";

export type OutsideClickContainer = Element | null | undefined;
export type OutsideClickContainers =
  | OutsideClickContainer
  | readonly OutsideClickContainer[]
  | ReadonlySet<OutsideClickContainer>;

const MOVE_THRESHOLD_PX = 30;

function resolvedContainers(
  input: OutsideClickContainers,
): Iterable<OutsideClickContainer> {
  if (Array.isArray(input)) return input;
  if (input instanceof Set) return input;
  return [input as OutsideClickContainer];
}

export function createOutsideClick(
  enabled: Accessor<boolean>,
  containers: Accessor<OutsideClickContainers>,
  callback: (
    event: MouseEvent | PointerEvent | FocusEvent | TouchEvent,
    target: HTMLOrSVGElement & Element,
  ) => void,
  owner: Accessor<Document | null> = () =>
    typeof document === "undefined" ? null : document,
): void {
  const handleOutsideClick = <
    TEvent extends MouseEvent | PointerEvent | FocusEvent | TouchEvent,
  >(
    event: TEvent,
    resolveTarget: (event: TEvent) => (HTMLOrSVGElement & Element) | null,
  ) => {
    if (event.defaultPrevented) return;

    const target = resolveTarget(event);
    if (!target) return;
    if (!target.getRootNode().contains(target)) return;
    if (!target.isConnected) return;

    for (const container of resolvedContainers(containers())) {
      if (!container) continue;
      if (container.contains(target)) return;
      if (event.composed && event.composedPath().includes(container)) return;
    }

    if (
      !isFocusableElement(target, FocusableMode.Loose) &&
      target.tabIndex !== -1
    ) {
      event.preventDefault();
    }

    callback(event, target);
  };

  let initialClickTarget: HTMLElement | null = null;

  createDocumentEvent(
    enabled,
    "pointerdown",
    (event) => {
      if (isMobile()) return;
      const target = event.composedPath?.()[0] ?? event.target;
      initialClickTarget = DOM.isHTMLElement(target) ? target : null;
    },
    true,
    owner,
  );

  createDocumentEvent(
    enabled,
    "pointerup",
    (event) => {
      if (isMobile() || !initialClickTarget) return;
      const target = initialClickTarget;
      initialClickTarget = null;
      handleOutsideClick(event, () => target);
    },
    true,
    owner,
  );

  let startPosition = { x: 0, y: 0 };

  createDocumentEvent(
    enabled,
    "touchstart",
    (event) => {
      const touch = event.touches.item(0);
      if (!touch) return;
      startPosition = { x: touch.clientX, y: touch.clientY };
    },
    true,
    owner,
  );

  createDocumentEvent(
    enabled,
    "touchend",
    (event) => {
      const touch = event.changedTouches.item(0);
      if (!touch) return;
      if (
        Math.abs(touch.clientX - startPosition.x) >= MOVE_THRESHOLD_PX ||
        Math.abs(touch.clientY - startPosition.y) >= MOVE_THRESHOLD_PX
      ) {
        return;
      }

      handleOutsideClick(
        event,
        (currentEvent) =>
          DOM.isHTMLorSVGElement(currentEvent.target)
            ? currentEvent.target
            : null,
      );
    },
    true,
    owner,
  );

  createWindowEvent(
    enabled,
    "blur",
    (event) =>
      handleOutsideClick(event, () => {
        const activeElement = owner()?.activeElement;
        return DOM.isHTMLIframeElement(activeElement) ? activeElement : null;
      }),
    true,
    () => owner()?.defaultView ?? null,
  );
}
