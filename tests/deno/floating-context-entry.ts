import { createRoot } from "solid-js";
import {
  useFloatingPanel,
  useFloatingReference,
} from "../../src/internal/floating.tsx";

export function readOrphanFloatingReference(): void {
  createRoot(() => {
    useFloatingReference();
  });
}

export function readOrphanFloatingPanel(): void {
  createRoot(() => {
    useFloatingPanel();
  });
}
