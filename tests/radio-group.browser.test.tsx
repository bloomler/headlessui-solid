import { render } from "@solidjs/web";
import { DEV, flush } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
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

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  await settle();
  host?.remove();
  host = undefined;
  document.body.replaceChildren();
});

test.each(
  [
    ["without a selected value", undefined, "alpha"],
    ["with a selected value", "beta", "beta"],
  ] as const,
)(
  "Tab and Shift+Tab enter and leave the group %s without selecting",
  async (_label, selected, expectedEntry) => {
    const diagnostics = DEV?.diagnostics.capture();
    const changes: string[] = [];
    host = document.createElement("div");
    document.body.append(host);
    dispose = render(
      () => (
        <>
          <button id="before" type="button">Before</button>
          <RadioGroup
            value={selected}
            onChange={(value) => changes.push(value)}
          >
            <Radio id="alpha" value="alpha">Alpha</Radio>
            <Radio id="beta" value="beta">Beta</Radio>
            <Radio id="gamma" value="gamma">Gamma</Radio>
          </RadioGroup>
          <button id="after" type="button">After</button>
        </>
      ),
      host,
    );
    await settle();

    await userEvent.tab();
    expect(document.activeElement?.id).toBe("before");
    await userEvent.tab();
    expect(document.activeElement?.id).toBe(expectedEntry);
    expect(changes).toEqual([]);
    await userEvent.tab();
    expect(document.activeElement?.id).toBe("after");

    await userEvent.tab({ shift: true });
    expect(document.activeElement?.id).toBe(expectedEntry);
    expect(changes).toEqual([]);
    await userEvent.tab({ shift: true });
    expect(document.activeElement?.id).toBe("before");
    expect(diagnostics?.stop() ?? []).toEqual([]);
  },
);

test("Tab skips an entirely disabled RadioGroup", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(
    () => (
      <>
        <button id="disabled-before" type="button">Before</button>
        <RadioGroup disabled value="alpha" onChange={() => {}}>
          <Radio value="alpha">Alpha</Radio>
          <Radio value="beta">Beta</Radio>
        </RadioGroup>
        <button id="disabled-after" type="button">After</button>
      </>
    ),
    host,
  );
  await settle();

  await userEvent.tab();
  expect(document.activeElement?.id).toBe("disabled-before");
  await userEvent.tab();
  expect(document.activeElement?.id).toBe("disabled-after");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
