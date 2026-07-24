import { createSignal, flush } from "solid-js";
import { mergeEventProps } from "../../src/utils/merge-event-props.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("mergeEventProps calls handlers consumer-first", () => {
  const calls: string[] = [];
  const props = mergeEventProps(
    { onClick: () => calls.push("consumer") },
    { onClick: () => calls.push("internal") },
  );

  (props.onClick as (event: Event) => void)(
    new Event("click", {
      cancelable: true,
    }),
  );

  assert(calls.join(",") === "consumer,internal", `Unexpected order: ${calls}`);
});

Deno.test("preventDefault skips later internal handlers", () => {
  const calls: string[] = [];
  const props = mergeEventProps(
    {
      onClick: (event: Event) => {
        calls.push("consumer");
        event.preventDefault();
      },
    },
    { onClick: () => calls.push("internal") },
  );

  (props.onClick as (event: Event) => void)(
    new Event("click", {
      cancelable: true,
    }),
  );

  assert(calls.join(",") === "consumer", `Unexpected calls: ${calls}`);
});

Deno.test("disabled interaction suppression follows reactive props", () => {
  const [disabled, setDisabled] = createSignal(false);
  let calls = 0;
  const props = mergeEventProps(
    {
      get disabled() {
        return disabled();
      },
    },
    { onClick: () => calls++ },
  );

  (props.onClick as (event: Event) => void)(
    new Event("click", {
      cancelable: true,
    }),
  );
  assert(calls === 1, "Enabled handler did not run");

  setDisabled(true);
  flush();
  const event = new Event("click", { cancelable: true });
  (props.onClick as (event: Event) => void)(event);

  assert(calls === 1, "Disabled handler unexpectedly ran");
  assert(event.defaultPrevented, "Disabled event was not cancelled");
});

Deno.test("self-referential aria-labelledby is omitted", () => {
  const props = mergeEventProps({ id: "item-1", "aria-labelledby": "item-1" });
  assert(props["aria-labelledby"] === undefined, "Self-label was retained");
});
