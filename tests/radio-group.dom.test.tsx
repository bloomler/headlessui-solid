import { render } from "@solidjs/web";
import { createSignal, DEV, flush } from "solid-js";
import { afterEach, expect, test } from "vitest";
import {
  Radio,
  RadioGroup,
} from "../src/components/radio-group/radio-group.tsx";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

function radios(): HTMLElement[] {
  return Array.from(
    host?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
  );
}

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  await settle();
  host?.remove();
  host = undefined;
  document.body.replaceChildren();
});

test("uncontrolled RadioGroup updates, focuses, and stays diagnostic-free", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const changes: string[] = [];
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(
    () => (
      <RadioGroup
        defaultValue="pickup"
        onChange={(value) => changes.push(value)}
      >
        <Radio value="pickup">Pickup</Radio>
        <Radio value="delivery">Delivery</Radio>
      </RadioGroup>
    ),
    host,
  );
  await settle();

  const [pickup, delivery] = radios();
  expect(pickup.getAttribute("aria-checked")).toBe("true");
  expect(pickup.tabIndex).toBe(0);
  expect(delivery.tabIndex).toBe(-1);

  delivery.click();
  await settle();
  expect(changes).toEqual(["delivery"]);
  expect(document.activeElement).toBe(delivery);
  expect(delivery.getAttribute("aria-checked")).toBe("true");
  expect(delivery.hasAttribute("data-checked")).toBe(true);

  delivery.click();
  delivery.click();
  await settle();
  expect(changes).toEqual(["delivery"]);
  expect(diagnostics?.stop()).toEqual([]);
});

test("arrow keys skip disabled radios and wrap while selecting", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const changes: string[] = [];
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(
    () => (
      <RadioGroup
        defaultValue="alpha"
        onChange={(value) => changes.push(value)}
      >
        <Radio value="alpha">Alpha</Radio>
        <Radio value="beta" disabled>Beta</Radio>
        <Radio value="gamma">Gamma</Radio>
      </RadioGroup>
    ),
    host,
  );
  await settle();

  const [alpha, beta, gamma] = radios();
  alpha.focus();
  alpha.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
  );
  await settle();
  expect(document.activeElement).toBe(gamma);
  expect(gamma.getAttribute("aria-checked")).toBe("true");
  expect(beta.getAttribute("aria-disabled")).toBe("true");

  gamma.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
  );
  await settle();
  expect(document.activeElement).toBe(alpha);
  expect(alpha.getAttribute("aria-checked")).toBe("true");

  alpha.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
  );
  await settle();
  expect(document.activeElement).toBe(gamma);

  gamma.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
  );
  await settle();
  expect(document.activeElement).toBe(alpha);

  alpha.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  await settle();
  expect(document.activeElement).toBe(gamma);
  expect(changes).toEqual(["gamma", "alpha", "gamma", "alpha", "gamma"]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Space selects the focused radio and object comparators stay reactive", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const changes: number[] = [];
  host = document.createElement("div");
  document.body.append(host);

  function Example() {
    const [value, setValue] = createSignal({ id: 1, name: "Alice" });
    return (
      <RadioGroup
        by="id"
        value={value()}
        onChange={(next) => {
          changes.push(next.id);
          setValue(next);
        }}
      >
        <Radio value={{ id: 1, name: "Alicia" }}>Alice</Radio>
        <Radio value={{ id: 2, name: "Bob" }}>Bob</Radio>
      </RadioGroup>
    );
  }

  dispose = render(() => <Example />, host);
  await settle();
  const [alice, bob] = radios();
  expect(alice.getAttribute("aria-checked")).toBe("true");

  bob.focus();
  bob.dispatchEvent(
    new KeyboardEvent("keydown", { key: " ", bubbles: true }),
  );
  await settle();
  expect(bob.getAttribute("aria-checked")).toBe("true");

  bob.dispatchEvent(
    new KeyboardEvent("keydown", { key: " ", bubbles: true }),
  );
  await settle();
  expect(changes).toEqual([2]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("form fields update before onChange and reset to the initial default", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let observedDuringChange: FormDataEntryValue | null = null;
  let submits = 0;
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(
    () => (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submits++;
        }}
      >
        <RadioGroup
          defaultValue="pickup"
          name="delivery"
          onChange={() => {
            const form = host?.querySelector("form");
            observedDuringChange = form
              ? new FormData(form).get("delivery")
              : null;
          }}
        >
          <Radio value="pickup">Pickup</Radio>
          <Radio value="delivery">Delivery</Radio>
        </RadioGroup>
        <button type="submit">Submit</button>
      </form>
    ),
    host,
  );
  await settle();

  const form = host.querySelector("form");
  expect(form).not.toBeNull();
  expect(new FormData(form!).get("delivery")).toBe("pickup");

  radios()[1].click();
  await settle();
  expect(observedDuringChange).toBe("delivery");
  expect(new FormData(form!).get("delivery")).toBe("delivery");

  form!.reset();
  await settle();
  expect(new FormData(form!).get("delivery")).toBe("pickup");
  expect(radios()[0].getAttribute("aria-checked")).toBe("true");

  radios()[0].dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  expect(submits).toBe(1);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("disabled groups suppress selection and successful form data", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let changes = 0;
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(
    () => (
      <form>
        <RadioGroup
          value="pickup"
          name="delivery"
          disabled
          onChange={() => changes++}
        >
          <Radio value="pickup">Pickup</Radio>
          <Radio value="delivery">Delivery</Radio>
        </RadioGroup>
      </form>
    ),
    host,
  );
  await settle();

  radios()[1].click();
  await settle();
  expect(changes).toBe(0);
  expect(radios().every((radio) => radio.tabIndex === -1)).toBe(true);
  expect(new FormData(host.querySelector("form")!).has("delivery")).toBe(
    false,
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test.each(
  [
    ["undefined", undefined],
    ["null", null],
  ] as const,
)(
  "an initially %s value makes only the first enabled radio tabbable",
  async (_label, initialValue) => {
    const diagnostics = DEV?.diagnostics.capture();
    host = document.createElement("div");
    document.body.append(host);
    dispose = render(
      () => (
        <RadioGroup<"div", string | null | undefined>
          value={initialValue}
          onChange={() => {}}
          tabIndex={2}
        >
          <Radio value="disabled" disabled>Disabled</Radio>
          <Radio value="pickup">Pickup</Radio>
          <Radio value="delivery">Delivery</Radio>
        </RadioGroup>
      ),
      host,
    );
    await settle();

    const [disabled, pickup, delivery] = radios();
    expect(disabled.tabIndex).toBe(-1);
    expect(pickup.tabIndex).toBe(2);
    expect(delivery.tabIndex).toBe(-1);
    expect(diagnostics?.stop() ?? []).toEqual([]);
  },
);

test("reactive option presence and disabled state retain DOM order", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let toggleMiddle!: () => void;
  let enableLast!: () => void;
  const changes: string[] = [];

  function Example() {
    const [middle, setMiddle] = createSignal(false);
    const [lastDisabled, setLastDisabled] = createSignal(true);
    toggleMiddle = () => setMiddle((value) => !value);
    enableLast = () => setLastDisabled(false);

    return (
      <RadioGroup onChange={(value) => changes.push(value)}>
        <Radio value="alpha">Alpha</Radio>
        {middle() && <Radio value="beta">Beta</Radio>}
        <Radio value="gamma" disabled={lastDisabled()}>
          {(slot) => slot.disabled ? "Gamma disabled" : "Gamma"}
        </Radio>
      </RadioGroup>
    );
  }

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <Example />, host);
  await settle();

  toggleMiddle();
  await settle();
  let [alpha, beta, gamma] = radios();
  expect(radios().map((radio) => radio.textContent)).toEqual([
    "Alpha",
    "Beta",
    "Gamma disabled",
  ]);
  expect(gamma.getAttribute("aria-disabled")).toBe("true");

  alpha.focus();
  alpha.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  await settle();
  expect(document.activeElement).toBe(beta);

  toggleMiddle();
  enableLast();
  await settle();
  [alpha, gamma] = radios();
  expect(gamma.getAttribute("aria-disabled")).toBeNull();

  alpha.focus();
  alpha.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  await settle();
  expect(document.activeElement).toBe(gamma);
  expect(changes).toEqual(["beta", "gamma"]);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("external forms encode and reset complex uncontrolled values", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const alice = { id: 1, name: "Alice" };
  const bob = { id: 2, name: "Bob" };

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(
    () => (
      <>
        <RadioGroup
          by="id"
          defaultValue={bob}
          form="assignee-form"
          name="assignee"
        >
          <Radio value={alice}>Alice</Radio>
          <Radio value={bob}>Bob</Radio>
        </RadioGroup>
        <form id="assignee-form" />
      </>
    ),
    host,
  );
  await settle();

  const form = host.querySelector<HTMLFormElement>("#assignee-form")!;
  expect(Object.fromEntries(new FormData(form))).toEqual({
    "assignee[id]": "2",
    "assignee[name]": "Bob",
  });

  radios()[0].click();
  await settle();
  expect(Object.fromEntries(new FormData(form))).toEqual({
    "assignee[id]": "1",
    "assignee[name]": "Alice",
  });

  radios()[0].click();
  await settle();
  expect(Object.fromEntries(new FormData(form))["assignee[id]"]).toBe("1");

  form.reset();
  await settle();
  expect(Object.fromEntries(new FormData(form))).toEqual({
    "assignee[id]": "2",
    "assignee[name]": "Bob",
  });
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
