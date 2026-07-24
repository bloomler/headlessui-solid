// Keep one context identity across Transition and every overlay family. This
// compatibility module is the canonical import path for new Solid components.
export {
  OpenClosedProvider,
  OpenClosedState,
  ResetOpenClosedProvider,
  useOpenClosed,
} from "./transition-open-closed.tsx";
