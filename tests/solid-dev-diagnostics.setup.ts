import { DEV, refresh } from "solid-js";
import { afterEach, beforeEach } from "vitest";

const diagnostics = DEV?.diagnostics;
if (!diagnostics) {
  throw new Error(
    "Solid DEV diagnostics are unavailable. Run Vitest with Solid's browser development export.",
  );
}

const positiveControl = diagnostics.capture();
let refreshThrew = false;

try {
  (refresh as unknown as (target: unknown) => void)(null);
} catch {
  refreshThrew = true;
}

const positiveControlEvents = positiveControl.stop();
if (
  !refreshThrew || positiveControlEvents.length !== 1 ||
  positiveControlEvents[0]?.code !== "INVALID_REFRESH_TARGET"
) {
  throw new Error(
    `Solid DEV diagnostic positive control failed: expected exactly INVALID_REFRESH_TARGET, received ${
      JSON.stringify(positiveControlEvents.map((event) => event.code))
    }`,
  );
}

const cleanState = diagnostics.capture();
const leakedEvents = cleanState.stop();
if (leakedEvents.length !== 0) {
  throw new Error(
    `Solid DEV diagnostic positive control left events behind: ${
      JSON.stringify(leakedEvents.map((event) => event.code))
    }`,
  );
}

let testCapture:
  | ReturnType<(typeof diagnostics)["capture"]>
  | undefined;

beforeEach(() => {
  if (testCapture) {
    testCapture.stop();
    testCapture = undefined;
    throw new Error(
      "Solid DEV diagnostic capture was still active at the start of a test.",
    );
  }

  testCapture = diagnostics.capture();
});

afterEach(() => {
  const capture = testCapture;
  testCapture = undefined;

  if (!capture) {
    throw new Error(
      "Solid DEV diagnostic capture was not active at the end of a test.",
    );
  }

  const events = capture.stop();
  if (events.length !== 0) {
    throw new Error(
      `Unexpected Solid DEV diagnostics: ${
        JSON.stringify(
          events.map((event) => ({
            code: event.code,
            message: event.message,
            nodeName: event.nodeName,
            ownerName: event.ownerName,
          })),
        )
      }`,
    );
  }
});
