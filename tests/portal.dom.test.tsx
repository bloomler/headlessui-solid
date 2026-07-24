import { type Accessor, createSignal, DEV, flush, Show } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, expect, test } from "vitest";
import {
  Portal,
  PortalGroup,
  useNestedPortals,
} from "../src/components/portal/portal.tsx";
import { ForcePortalRoot } from "../src/internal/portal-force-root.tsx";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

function portalRoot(): HTMLElement | null {
  return document.getElementById("headlessui-portal-root");
}

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  await settle();
  host?.remove();
  host = undefined;
  document.body.replaceChildren();
});

test("Portal renders outside its logical parent and shares a managed root", async () => {
  const diagnostics = DEV?.diagnostics.capture();

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(
    () => (
      <main id="logical-parent">
        <Portal>
          <p id="content-a">A</p>
        </Portal>
        <Portal>
          <p id="content-b">B</p>
        </Portal>
      </main>
    ),
    host,
  );
  await settle();

  const root = portalRoot();
  const parent = document.getElementById("logical-parent");
  const contentA = document.getElementById("content-a");
  const contentB = document.getElementById("content-b");

  expect(root).not.toBeNull();
  expect(root?.querySelectorAll("[data-headlessui-portal]")).toHaveLength(2);
  expect(parent?.contains(contentA)).toBe(false);
  expect(parent?.contains(contentB)).toBe(false);
  expect(contentA?.textContent).toBe("A");
  expect(contentB?.textContent).toBe("B");
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("the managed root survives partial teardown and is removed after the last Portal", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setA!: (value: boolean) => boolean;
  let setB!: (value: boolean) => boolean;

  function Example() {
    const [showA, updateA] = createSignal(true);
    const [showB, updateB] = createSignal(true);
    setA = updateA;
    setB = updateB;

    return (
      <>
        {showA() && (
          <Portal>
            <span id="a">A</span>
          </Portal>
        )}
        {showB() && (
          <Portal>
            <span id="b">B</span>
          </Portal>
        )}
      </>
    );
  }

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <Example />, host);
  await settle();

  expect(portalRoot()?.children).toHaveLength(2);

  setA(false);
  await settle();
  expect(portalRoot()?.children).toHaveLength(1);

  setB(false);
  await settle();
  expect(portalRoot()).toBeNull();

  setA(true);
  setB(true);
  await settle();
  expect(portalRoot()?.children).toHaveLength(2);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("a removed managed root is recreated after its portals remount", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setVisible!: (value: boolean) => boolean;

  function Example() {
    const [visible, updateVisible] = createSignal(true);
    setVisible = updateVisible;
    return (
      <Show when={visible()}>
        <Portal>
          <span id="tamper-content">Content</span>
        </Portal>
      </Show>
    );
  }

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <Example />, host);
  await settle();

  portalRoot()?.remove();
  expect(portalRoot()).toBeNull();

  setVisible(false);
  await settle();
  setVisible(true);
  await settle();

  expect(portalRoot()?.querySelector("#tamper-content")?.textContent).toBe(
    "Content",
  );
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("enabled false renders inline and can move into and out of the portal", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let setEnabled!: (value: boolean) => boolean;

  function Example() {
    const [enabled, updateEnabled] = createSignal(false);
    setEnabled = updateEnabled;

    return (
      <main id="inline-parent">
        <Portal enabled={enabled()}>
          <span id="movable">Movable</span>
        </Portal>
      </main>
    );
  }

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <Example />, host);
  await settle();

  const parent = document.getElementById("inline-parent");
  expect(parent?.contains(document.getElementById("movable"))).toBe(true);
  expect(portalRoot()).toBeNull();

  setEnabled(true);
  await settle();
  expect(parent?.contains(document.getElementById("movable"))).toBe(false);
  expect(portalRoot()?.textContent).toContain("Movable");

  setEnabled(false);
  await settle();
  expect(parent?.contains(document.getElementById("movable"))).toBe(true);
  expect(portalRoot()).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("PortalGroup follows a reactive target while ForcePortalRoot bypasses it", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const [groupTarget, setGroupTarget] = createSignal<HTMLElement | null>(null);

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(
    () => (
      <main>
        <aside id="group-target" ref={setGroupTarget}>Target</aside>
        <PortalGroup target={groupTarget}>
          <section id="group-sibling">Sibling</section>
          <Portal>
            <span id="grouped">Grouped</span>
          </Portal>
          <ForcePortalRoot force>
            <Portal>
              <span id="forced">Forced</span>
            </Portal>
          </ForcePortalRoot>
        </PortalGroup>
      </main>
    ),
    host,
  );
  await settle();

  const target = document.getElementById("group-target");
  const sibling = document.getElementById("group-sibling");
  const grouped = document.getElementById("grouped");
  const forced = document.getElementById("forced");

  expect(target?.contains(grouped)).toBe(true);
  expect(target?.contains(sibling)).toBe(false);
  expect(portalRoot()?.contains(forced)).toBe(true);

  const nextTarget = document.createElement("aside");
  nextTarget.id = "next-target";
  document.body.append(nextTarget);
  setGroupTarget(nextTarget);
  await settle();

  expect(nextTarget.contains(document.getElementById("grouped"))).toBe(true);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("a concrete as element receives Portal props and its ordinary ref", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let contentElement: HTMLElement | undefined;

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(
    () => (
      <Portal
        as="section"
        class="content-shell"
        id="content-shell"
        ref={(element) => contentElement = element}
      >
        Content
      </Portal>
    ),
    host,
  );
  await settle();

  expect(contentElement).toBe(document.getElementById("content-shell"));
  expect(contentElement?.tagName).toBe("SECTION");
  expect(contentElement?.className).toBe("content-shell");
  expect(contentElement?.parentElement?.hasAttribute("data-headlessui-portal"))
    .toBe(true);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("ownerDocument scopes the managed root and cleanup", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  const ownerDocument = document.implementation.createHTMLDocument("portal");

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(
    () => (
      <Portal ownerDocument={ownerDocument}>
        <span id="foreign-content">Foreign</span>
      </Portal>
    ),
    host,
  );
  await settle();

  expect(portalRoot()).toBeNull();
  expect(
    ownerDocument.getElementById("headlessui-portal-root")?.textContent,
  ).toContain("Foreign");

  dispose();
  dispose = undefined;
  await settle();
  expect(ownerDocument.getElementById("headlessui-portal-root")).toBeNull();
  expect(diagnostics?.stop() ?? []).toEqual([]);
});

test("nested portal collectors register through every logical parent", async () => {
  const diagnostics = DEV?.diagnostics.capture();
  let outerPortals!: Accessor<readonly HTMLElement[]>;
  let innerPortals!: Accessor<readonly HTMLElement[]>;

  function Inner() {
    const [portals, PortalWrapper] = useNestedPortals();
    innerPortals = portals;

    return (
      <PortalWrapper>
        <Portal>
          <span>Nested</span>
        </Portal>
      </PortalWrapper>
    );
  }

  function Example() {
    const [portals, PortalWrapper] = useNestedPortals();
    outerPortals = portals;

    return (
      <PortalWrapper>
        <Inner />
      </PortalWrapper>
    );
  }

  host = document.createElement("div");
  document.body.append(host);
  dispose = render(() => <Example />, host);
  await settle();

  expect(innerPortals()).toHaveLength(1);
  expect(outerPortals()).toHaveLength(1);

  dispose();
  dispose = undefined;
  await settle();

  expect(innerPortals()).toHaveLength(0);
  expect(outerPortals()).toHaveLength(0);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
