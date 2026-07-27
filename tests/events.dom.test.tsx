import { render } from "@solidjs/web";
import {
  createMemo,
  createSignal,
  DEV,
  type Element,
  flush,
  untrack,
} from "solid-js";
import { afterEach, expect, test } from "vitest";
import { createEventListener } from "../src/primitives/events.ts";
import { mergeEventProps } from "../src/utils/merge-event-props.ts";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  host?.remove();
  host = undefined;
});

test("native events establish an imperative boundary during renderer work", () => {
  const diagnostics = DEV?.diagnostics.capture();
  const target = new EventTarget();
  let observed = 0;

  function Probe(): Element {
    const [value] = createSignal(7, { name: "event-boundary-value" });
    createEventListener(
      () => target,
      "headlessui-test",
      () => observed = value(),
    );
    return undefined;
  }

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <Probe />, host);
  flush();

  untrack(
    () => target.dispatchEvent(new Event("headlessui-test")),
    "an effect callback",
  );

  expect(observed).toBe(7);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("merged delegated handlers resolve reactive sources at an imperative boundary", () => {
  const diagnostics = DEV?.diagnostics.capture();
  const calls: string[] = [];
  let handleFocusOut!: (event: FocusEvent) => void;

  function Probe(): Element {
    const [disabled] = createSignal(false, {
      name: "merged-event-disabled",
    });
    const [revision] = createSignal(1, {
      name: "merged-event-handler-revision",
    });
    const merged = mergeEventProps(
      {
        get onFocusOut() {
          revision();
          return () => calls.push("consumer");
        },
      },
      {
        get disabled() {
          return disabled();
        },
        get onFocusOut() {
          revision();
          return () => calls.push("internal");
        },
      },
    );
    const composed = createMemo(
      () => merged.onFocusOut as (event: FocusEvent) => void,
    );
    handleFocusOut = untrack(composed);
    return undefined;
  }

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <Probe />, host);
  flush();

  // This reproduces a native focusout arriving while Solid's renderer is in
  // its strict, untracked effect callback.
  untrack(
    () => handleFocusOut(new FocusEvent("focusout")),
    "an effect callback",
  );

  expect(calls).toEqual(["consumer", "internal"]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("cross-realm preventDefault suppresses later merged handlers", () => {
  const calls: string[] = [];
  host = document.createElement("div");
  document.body.append(host);
  const frame = document.createElement("iframe");
  host.append(frame);
  const ForeignEvent = Reflect.get(
    frame.contentWindow!,
    "Event",
  ) as typeof Event;
  const event = new ForeignEvent("click", { cancelable: true });
  const merged = mergeEventProps(
    {
      onClick(event: Event) {
        calls.push("consumer");
        event.preventDefault();
      },
    },
    {
      onClick() {
        calls.push("internal");
      },
    },
  );

  expect(event).not.toBeInstanceOf(Event);
  (merged.onClick as (event: Event) => void)(event);

  expect(event.defaultPrevented).toBe(true);
  expect(calls).toEqual(["consumer"]);
});

test("disabled merged handlers prevent cross-realm events", () => {
  const calls: string[] = [];
  host = document.createElement("div");
  document.body.append(host);
  const frame = document.createElement("iframe");
  host.append(frame);
  const ForeignEvent = Reflect.get(
    frame.contentWindow!,
    "Event",
  ) as typeof Event;
  const event = new ForeignEvent("click", { cancelable: true });
  const merged = mergeEventProps(
    {
      disabled: true,
      onClick() {
        calls.push("consumer");
      },
    },
    {
      onClick() {
        calls.push("internal");
      },
    },
  );

  expect(event).not.toBeInstanceOf(Event);
  (merged.onClick as (event: Event) => void)(event);

  expect(event.defaultPrevented).toBe(true);
  expect(calls).toEqual([]);
});

test('aria-disabled="false" leaves merged pointer handlers enabled', () => {
  const calls: string[] = [];
  const event = new MouseEvent("click", { cancelable: true });
  const merged = mergeEventProps(
    {
      "aria-disabled": "false",
      onClick() {
        calls.push("consumer");
      },
    },
    {
      onClick() {
        calls.push("internal");
      },
    },
  );

  (merged.onClick as (event: MouseEvent) => void)(event);

  expect(event.defaultPrevented).toBe(false);
  expect(calls).toEqual(["consumer", "internal"]);
});
