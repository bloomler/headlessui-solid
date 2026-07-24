import { DEV, refresh } from "solid-js";

interface DiagnosticLike {
  code?: string;
  message?: string;
  nodeName?: string;
  ownerName?: string;
}

export interface SolidDiagnosticCapture {
  stop(): string[];
}

function diagnosticDetails(events: readonly DiagnosticLike[]): string[] {
  return events.map((event) =>
    [
      event.code,
      event.ownerName,
      event.nodeName,
      event.message,
    ].filter(Boolean).join(" | ")
  );
}

function startSolidDiagnosticCapture() {
  const diagnostics = DEV?.diagnostics;
  if (!diagnostics) {
    throw new Error(
      "Solid DEV diagnostics are unavailable. Run this diagnostic harness with the development export condition.",
    );
  }
  return diagnostics.capture();
}

export function captureSolidDiagnostics(): SolidDiagnosticCapture {
  const capture = startSolidDiagnosticCapture();
  let result: string[] | undefined;

  return {
    stop() {
      return result ??= diagnosticDetails(capture.stop());
    },
  };
}

export function assertSolidDiagnosticsCapture(): void {
  const capture = startSolidDiagnosticCapture();
  let probeThrew = false;

  try {
    (refresh as unknown as (target: unknown) => void)(null);
  } catch {
    probeThrew = true;
  }

  const events = capture.stop();
  if (
    !probeThrew || events.length !== 1 ||
    events[0]?.code !== "INVALID_REFRESH_TARGET"
  ) {
    throw new Error(
      `Solid DEV diagnostic positive control failed: expected exactly INVALID_REFRESH_TARGET, received ${
        JSON.stringify(events.map((event) => event.code))
      }`,
    );
  }
}
