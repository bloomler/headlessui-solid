import { createSignal, DEV, flush } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { Portal } from "../src/components/portal/portal.tsx";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  flush();
  await Promise.resolve();
  host?.remove();
  host = undefined;
  document.getElementById("headlessui-portal-root")?.remove();
});

test("delegated native events cross the Solid Portal boundary", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  function Example() {
    const [count, setCount] = createSignal(0);

    return (
      <main id="logical-parent">
        <output aria-label="count">{count()}</output>
        <Portal>
          <button type="button" onClick={() => setCount((value) => value + 1)}>
            Increment
          </button>
        </Portal>
      </main>
    );
  }

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <Example />, host);
  flush();

  const button = page.getByRole("button", { name: "Increment" });
  await button.click();
  flush();

  await expect.element(page.getByLabelText("count")).toHaveTextContent("1");

  const portalContent = document.querySelector(
    "#headlessui-portal-root [data-headlessui-portal] button",
  );
  expect(portalContent).toBeInstanceOf(HTMLButtonElement);
  expect(document.getElementById("logical-parent")?.contains(portalContent))
    .toBe(false);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
