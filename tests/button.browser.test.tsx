import { type JSX, render } from "@solidjs/web";
import { createSignal, DEV, flush } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { Button } from "../src/index.ts";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  host?.remove();
  dispose = undefined;
  host = undefined;
});

test("Button is reactive and preserves consumer event precedence", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const calls: string[] = [];

  function Example() {
    const [disabled, setDisabled] = createSignal(false);

    return (
      <>
        <Button
          disabled={disabled()}
          onClick={(event) => {
            calls.push("consumer");
            event.preventDefault();
          }}
        >
          {(slot) => slot.disabled ? "Unavailable" : "Ready"}
        </Button>
        <button type="button" onClick={() => setDisabled(true)}>Disable</button>
      </>
    );
  }

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <Example />, host);

  const button = page.getByRole("button", { name: "Ready" });
  await expect.element(button).toHaveAttribute("type", "button");
  await button.click();
  expect(calls).toEqual(["consumer"]);

  await page.getByRole("button", { name: "Disable" }).click();
  flush();
  const disabledButton = page.getByRole("button", { name: "Unavailable" });
  await expect.element(disabledButton).toBeDisabled();
  await expect.element(disabledButton).toHaveAttribute("data-disabled", "");
  await disabledButton.click({ force: true });
  expect(calls).toEqual(["consumer"]);

  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Button supports polymorphic tags and native interaction state", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(
    () => (
      <Button as="a" href="#profile">
        {(slot) => slot.hover ? "Hovered" : slot.focus ? "Focused" : "Profile"}
      </Button>
    ),
    host,
  );

  const link = page.getByRole("link", { name: "Profile" });
  await expect.element(link).not.toHaveAttribute("type");
  await link.hover();
  await expect.element(page.getByRole("link", { name: "Hovered" }))
    .toHaveAttribute("data-hover", "");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Button exposes the complete upstream render-prop state", () => {
  const diagnostics = DEV?.diagnostics.capture();
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(
    () => <Button>{(slot) => JSON.stringify(slot)}</Button>,
    host,
  );
  flush();

  const button = host.querySelector("button");
  expect(JSON.parse(button?.textContent ?? "null")).toEqual({
    active: false,
    autofocus: false,
    disabled: false,
    focus: false,
    hover: false,
  });
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("Button maps Solid autofocus to native and data attributes", () => {
  const diagnostics = DEV?.diagnostics.capture();
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <Button autofocus>Autofocused</Button>, host);
  flush();

  const button = host.querySelector("button");
  expect(button?.hasAttribute("autofocus")).toBe(true);
  expect(button?.hasAttribute("data-autofocus")).toBe(true);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

function CustomButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  return <button {...props} />;
}

test("Button resolves type through an idiomatic Solid component target", () => {
  const diagnostics = DEV?.diagnostics.capture();
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(
    () => <Button as={CustomButton}>Custom button</Button>,
    host,
  );
  flush();

  expect(host.querySelector("button")?.getAttribute("type")).toBe("button");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
