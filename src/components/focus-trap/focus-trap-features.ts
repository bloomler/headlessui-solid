/**
 * Bit flags that enable individual focus-trap behaviors.
 */
export enum FocusTrapFeatures {
  /** No features enabled for the focus trap. */
  None = 0,

  /** Move focus into the container when the trap is enabled. */
  InitialFocus = 1 << 0,

  /** Trap Tab and Shift+Tab within the container. */
  TabLock = 1 << 1,

  /** Prevent programmatic focus from leaving the allowed containers. */
  FocusLock = 1 << 2,

  /** Restore focus when the trap is disabled or unmounted. */
  RestoreFocus = 1 << 3,

  /** Prefer an element marked with `data-autofocus` for initial focus. */
  AutoFocus = 1 << 4,
}
