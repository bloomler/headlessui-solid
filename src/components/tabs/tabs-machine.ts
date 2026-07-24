export type TabsOrientation = "horizontal" | "vertical";

export interface TabSelectionCandidate {
  readonly disabled: boolean;
}

enum SelectionDirection {
  Forwards,
  Backwards,
}

/**
 * Resolve a requested tab index using Headless UI's wrapping and disabled-tab
 * semantics. `currentIndex` is significant for controlled under/overflow:
 * incrementing past the end wraps forwards while decrementing before the
 * start wraps backwards.
 */
export function resolveTabSelectionIndex(
  currentIndex: number,
  requestedIndex: number,
  tabs: readonly TabSelectionCandidate[],
): number {
  const focusable = tabs
    .map((tab, index) => ({ disabled: tab.disabled, index }))
    .filter((tab) => !tab.disabled);

  if (requestedIndex < 0 || requestedIndex > tabs.length - 1) {
    const ordering = Math.sign(requestedIndex - currentIndex);
    const direction = ordering < 0
      ? SelectionDirection.Backwards
      : ordering > 0
      ? SelectionDirection.Forwards
      : requestedIndex < 0
      ? SelectionDirection.Forwards
      : SelectionDirection.Backwards;

    if (focusable.length === 0) return currentIndex;
    return direction === SelectionDirection.Forwards
      ? focusable[0].index
      : focusable[focusable.length - 1].index;
  }

  const ordered = [
    ...tabs.slice(requestedIndex).map((tab, offset) => ({
      disabled: tab.disabled,
      index: requestedIndex + offset,
    })),
    ...tabs.slice(0, requestedIndex).map((tab, index) => ({
      disabled: tab.disabled,
      index,
    })),
  ];
  return ordered.find((tab) => !tab.disabled)?.index ?? currentIndex;
}

/** Preserve the selected item's identity when an existing collection moves. */
export function resolveReorderedTabIndex<T>(
  previousOrder: readonly T[],
  nextOrder: readonly T[],
  selectedIndex: number,
): number {
  const selected = previousOrder[selectedIndex];
  if (selected === undefined) return selectedIndex;
  const nextIndex = nextOrder.indexOf(selected);
  return nextIndex === -1 ? selectedIndex : nextIndex;
}

export type TabFocusIntent = "first" | "last" | "next" | "previous";

export function resolveTabFocusIntent(
  orientation: TabsOrientation,
  key: string,
): TabFocusIntent | null {
  if (key === "Home" || key === "PageUp") return "first";
  if (key === "End" || key === "PageDown") return "last";

  if (orientation === "vertical") {
    if (key === "ArrowUp") return "previous";
    if (key === "ArrowDown") return "next";
    return null;
  }

  if (key === "ArrowLeft") return "previous";
  if (key === "ArrowRight") return "next";
  return null;
}
