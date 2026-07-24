import { renderToString } from "@solidjs/web";
import {
  FocusTrap,
  FocusTrapFeatures,
} from "../../src/components/focus-trap/focus-trap.tsx";

export function renderDefaultFocusTrap(): string {
  return renderToString(() => (
    <FocusTrap id="server-trap" class="trap-class">
      <button id="server-action" type="button">Action</button>
    </FocusTrap>
  ));
}

export function renderDisabledFocusTrap(): string {
  return renderToString(() => (
    <FocusTrap features={FocusTrapFeatures.None}>
      <button type="button">Unmanaged</button>
    </FocusTrap>
  ));
}

export function renderPolymorphicFocusTrap(): string {
  const initialFocus = { current: null as HTMLElement | null };
  const fallback = { current: null as HTMLElement | null };

  return renderToString(() => (
    <FocusTrap
      as="section"
      containers={() => []}
      features={FocusTrapFeatures.InitialFocus | FocusTrapFeatures.AutoFocus}
      initialFocus={initialFocus}
      initialFocusFallback={fallback}
      data-purpose="polymorphic"
    >
      <input data-autofocus />
    </FocusTrap>
  ));
}

export function renderFocusTrapSlot(): string {
  return renderToString(() => (
    <FocusTrap>
      {() => <span data-slot="resolved">Slot contents</span>}
    </FocusTrap>
  ));
}

export function readFocusTrapStatics(): Readonly<{
  all: number;
  autoFocus: number;
  sameEnum: boolean;
}> {
  return {
    all: FocusTrapFeatures.InitialFocus |
      FocusTrapFeatures.TabLock |
      FocusTrapFeatures.FocusLock |
      FocusTrapFeatures.RestoreFocus,
    autoFocus: FocusTrapFeatures.AutoFocus,
    sameEnum: FocusTrap.features === FocusTrapFeatures,
  };
}
