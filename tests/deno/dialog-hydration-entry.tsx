import { hydrate, renderToString } from "@solidjs/web";
import { createSignal } from "solid-js";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
} from "../../src/components/dialog/dialog.tsx";
import {
  assertSolidDiagnosticsCapture,
  captureSolidDiagnostics,
} from "./solid-diagnostics.ts";

function DialogHydrationFixture() {
  // The server intentionally omits portalled Dialog content. Starting open
  // makes hydration prove the client handoff can materialize that portal
  // without replacing or duplicating the surrounding server shell.
  const [open, setOpen] = createSignal(true);

  return (
    <main id="hydration-shell">
      <button
        id="hydration-opener"
        type="button"
        onClick={() => setOpen(true)}
      >
        Open hydrated dialog
      </button>
      <Dialog autofocus={false} open={open()} onClose={setOpen}>
        <DialogPanel id="hydration-panel">
          <DialogTitle id="hydration-title">Hydrated title</DialogTitle>
          <button
            id="hydration-close"
            type="button"
            onClick={() => setOpen(false)}
          >
            Close hydrated dialog
          </button>
        </DialogPanel>
      </Dialog>
      <span id="hydration-tail">After dialog</span>
    </main>
  );
}

export function renderDialogHydrationFixture(): string {
  return renderToString(() => <DialogHydrationFixture />);
}

export function assertDialogDiagnosticCapture(): void {
  assertSolidDiagnosticsCapture();
}

export function hydrateDialogFixture(element: HTMLElement): {
  diagnosticDetails(): string[];
  dispose(): void;
} {
  const diagnostics = captureSolidDiagnostics();
  let dispose: () => void;

  try {
    dispose = hydrate(() => <DialogHydrationFixture />, element);
  } catch (error) {
    const details = diagnostics.stop();
    if (details.length > 0) {
      throw new Error(
        `Unexpected Dialog hydration diagnostics:\n${details.join("\n")}`,
        { cause: error },
      );
    }
    throw error;
  }

  return {
    diagnosticDetails: diagnostics.stop,
    dispose,
  };
}
