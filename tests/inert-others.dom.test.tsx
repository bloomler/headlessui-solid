import { render } from "@solidjs/web";
import { createSignal, DEV, type Element, flush } from "solid-js";
import { afterEach, expect, test } from "vitest";
import {
  acquireInert,
  createInertOthers,
} from "../src/primitives/inert-others.ts";

let dispose: (() => void) | undefined;
const hosts: HTMLElement[] = [];

function append(element: HTMLElement): HTMLElement {
  document.body.append(element);
  hosts.push(element);
  return element;
}

function mount(view: () => Element): void {
  const host = append(document.createElement("div"));
  dispose = render(view, host);
  flush();
}

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  await settle();
  for (const host of hosts.splice(0)) host.remove();
  document.body.replaceChildren();
});

test("a disallowed element is inert only while the primitive is enabled", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const target = append(document.createElement("main"));
  target.setAttribute("aria-hidden", "legacy");
  let setEnabled!: (value: boolean) => boolean;

  function Probe(): Element {
    const [enabled, updateEnabled] = createSignal(true);
    setEnabled = updateEnabled;
    createInertOthers(enabled, { disallowed: () => [target] });
    return undefined;
  }

  mount(() => <Probe />);
  await settle();
  expect(target.inert).toBe(true);
  expect(target.getAttribute("aria-hidden")).toBe("true");

  setEnabled(false);
  await settle();
  expect(Boolean(target.inert)).toBe(false);
  expect(target.getAttribute("aria-hidden")).toBe("legacy");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("a disabled inert primitive leaves every element untouched", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const before = append(document.createElement("div"));
  const target = append(document.createElement("main"));
  const after = append(document.createElement("div"));

  function Probe(): Element {
    createInertOthers(() => false, { disallowed: () => [target] });
    return undefined;
  }

  mount(() => <Probe />);
  await settle();
  for (const element of [before, target, after]) {
    expect(Boolean(element.inert)).toBe(false);
    expect(element.hasAttribute("aria-hidden")).toBe(false);
  }
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("shared inert acquisitions restore state only after the final release", () => {
  const target = append(document.createElement("main"));
  const releaseFirst = acquireInert(target);
  const releaseSecond = acquireInert(target);

  expect(target.inert).toBe(true);
  releaseFirst();
  expect(target.inert).toBe(true);
  expect(target.getAttribute("aria-hidden")).toBe("true");

  releaseSecond();
  expect(Boolean(target.inert)).toBe(false);
  expect(target.hasAttribute("aria-hidden")).toBe(false);
});

test("allowed branches keep their ancestor path active and inert its siblings", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const tree = append(document.createElement("div"));
  tree.id = "a";
  tree.innerHTML = `
    <div id="a-a">
      <div id="a-a-a"></div>
      <div id="a-a-b"></div>
      <div id="a-a-c"></div>
    </div>
    <div id="a-b"></div>
    <div id="a-c"></div>
  `;
  const byId = (id: string) => tree.querySelector<HTMLElement>(`#${id}`)!;
  const aa = byId("a-a");
  const aaa = byId("a-a-a");
  const aab = byId("a-a-b");
  const aac = byId("a-a-c");
  const ab = byId("a-b");
  const ac = byId("a-c");
  let setEnabled!: (value: boolean) => boolean;

  function Probe(): Element {
    const [enabled, updateEnabled] = createSignal(false);
    setEnabled = updateEnabled;
    createInertOthers(enabled, { allowed: () => [aab, aac] });
    return undefined;
  }

  mount(() => <Probe />);
  await settle();
  for (const element of [tree, aa, aaa, aab, aac, ab, ac]) {
    expect(Boolean(element.inert)).toBe(false);
  }

  setEnabled(true);
  await settle();
  for (const element of [tree, aa, aab, aac]) {
    expect(Boolean(element.inert)).toBe(false);
  }
  for (const element of [aaa, ab, ac]) {
    expect(element.inert).toBe(true);
    expect(element.getAttribute("aria-hidden")).toBe("true");
  }
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
