import { hydrate } from "@solidjs/web";
import { flush } from "solid-js";
import { PackageHydrationFixture } from "./package-hydration-fixture.tsx";
import {
  assertSolidDiagnosticsCapture,
  captureSolidDiagnostics,
  type SolidDiagnosticCapture,
} from "./solid-diagnostics.ts";

export interface PackageHydrationHandle {
  diagnosticDetails(): string[];
  dispose(): void;
  flush(): void;
}

export function assertPackageBrowserDiagnosticCapture(): void {
  assertSolidDiagnosticsCapture();
}

export function hydratePackageFixture(
  element: HTMLElement,
): PackageHydrationHandle {
  const diagnostics: SolidDiagnosticCapture = captureSolidDiagnostics();
  let dispose: () => void;

  try {
    dispose = hydrate(() => <PackageHydrationFixture />, element);
  } catch (error) {
    const details = diagnostics.stop();
    if (details.length > 0) {
      throw new Error(
        `Unexpected packaged hydration diagnostics:\n${details.join("\n")}`,
        { cause: error },
      );
    }
    throw error;
  }

  return {
    diagnosticDetails: diagnostics.stop,
    dispose,
    flush,
  };
}
