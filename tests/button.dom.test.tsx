import { render } from "@solidjs/web";
import { createSignal, DEV, flush } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { Button } from "../src/index.ts";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  host?.remove();
  vi.restoreAllMocks();
  dispose = undefined;
  host = undefined;
});

test("Button updates without Solid 2 development diagnostics", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const calls: string[] = [];
  let isDisabled = () => false;

  function Example() {
    const [disabled, setDisabled] = createSignal(false);
    isDisabled = disabled;

    return (
      <>
        <Button
          disabled={disabled()}
          onClick={() => calls.push("consumer")}
        >
          {(slot) => slot.disabled ? "Unavailable" : "Ready"}
        </Button>
        <button
          type="button"
          onClick={() => {
            calls.push("disable");
            setDisabled(true);
          }}
        >
          Disable
        </button>
      </>
    );
  }

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <Example />, host);

  const controls = host.querySelectorAll("button");
  const button = controls.item(0);
  const disable = controls.item(1);

  expect(button.type).toBe("button");
  expect(button.textContent).toBe("Ready");
  button.click();
  expect(calls).toEqual(["consumer"]);

  disable.click();
  flush();
  await Promise.resolve();
  expect(calls).toEqual(["consumer", "disable"]);
  expect(isDisabled()).toBe(true);
  const updatedButton = host.querySelector("button");
  expect(updatedButton?.disabled).toBe(true);
  expect(updatedButton?.textContent).toBe("Unavailable");
  expect(updatedButton?.getAttribute("data-disabled")).toBe("");
  updatedButton?.click();
  expect(calls).toEqual(["consumer", "disable"]);

  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Button composes refs and supports an anchor", () => {
  let element: HTMLAnchorElement | undefined;

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(
    () => (
      <Button
        as="a"
        href="#profile"
        ref={(value) => element = value as HTMLAnchorElement}
      >
        Profile
      </Button>
    ),
    host,
  );

  expect(element).toBeInstanceOf(HTMLAnchorElement);
  expect(element?.getAttribute("type")).toBeNull();
  expect(element?.getAttribute("href")).toBe("#profile");
});

test("active press listeners are released when disposed while held", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const addEventListener = vi.spyOn(document, "addEventListener");
  const removeEventListener = vi.spyOn(document, "removeEventListener");

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <Button>Hold</Button>, host);
  flush();
  await Promise.resolve();
  flush();

  addEventListener.mockClear();
  removeEventListener.mockClear();

  const button = host.querySelector("button")!;
  button.dispatchEvent(
    new MouseEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 1,
      clientY: 1,
    }),
  );
  flush();

  const pointerListeners = addEventListener.mock.calls.filter(([type]) =>
    type === "pointerup" || type === "pointermove" || type === "pointercancel"
  );
  expect(pointerListeners.map(([type]) => type).sort()).toEqual([
    "pointercancel",
    "pointermove",
    "pointerup",
  ]);

  dispose();
  dispose = undefined;
  flush();

  for (const [type, listener] of pointerListeners) {
    expect(removeEventListener).toHaveBeenCalledWith(type, listener);
  }

  expect(() => {
    document.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 100,
        clientY: 100,
      }),
    );
    document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    document.dispatchEvent(new MouseEvent("pointercancel", { bubbles: true }));
    flush();
  }).not.toThrow();
  expect(
    addEventListener.mock.calls.filter(([type]) =>
      type === "pointerup" || type === "pointermove" || type === "pointercancel"
    ),
  ).toHaveLength(3);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("the Solid 2 DOM harness propagates a direct signal update", async () => {
  function Direct() {
    const [disabled, setDisabled] = createSignal(false);
    return (
      <>
        <button type="button" disabled={disabled()}>
          {disabled() ? "Unavailable" : "Ready"}
        </button>
        <button type="button" onClick={() => setDisabled(true)}>Disable</button>
      </>
    );
  }

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <Direct />, host);

  host.querySelectorAll("button").item(1).click();
  flush();
  await Promise.resolve();

  const button = host.querySelector("button");
  expect(button?.disabled).toBe(true);
  expect(button?.textContent).toBe("Unavailable");
});
