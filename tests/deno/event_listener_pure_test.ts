import { listen } from "../../src/utils/event-listener.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

Deno.test("native listener cleanup is idempotent and preserves options", () => {
  const target = new EventTarget();
  let calls = 0;
  const dispose = listen(target, "headlessui-test", () => calls++, {
    capture: true,
  });

  target.dispatchEvent(new Event("headlessui-test"));
  assertEquals(calls, 1);

  dispose();
  dispose();
  target.dispatchEvent(new Event("headlessui-test"));
  assertEquals(calls, 1);
});

Deno.test("a missing native event target is a safe no-op", () => {
  const dispose = listen(null, "headlessui-test", () => {
    throw new Error("Listener should not be attached");
  });
  dispose();
});
