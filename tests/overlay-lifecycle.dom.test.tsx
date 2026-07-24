import { render } from "@solidjs/web";
import {
  createSignal,
  DEV,
  type Element as SolidElement,
  flush,
} from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Portal } from "../src/components/portal/portal.tsx";
import { createOnDisappear } from "../src/primitives/on-disappear.ts";
import {
  MainTreeProvider,
  useMainTreeNode,
} from "../src/primitives/root-containers.tsx";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;
let stopDiagnostics: (() => readonly unknown[]) | undefined;

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

function mount(view: () => SolidElement): void {
  host = document.createElement("div");
  host.id = "overlay-test-app";
  document.body.append(host);
  dispose = render(view, host);
  flush();
}

beforeEach(() => {
  const diagnostics = DEV?.diagnostics.capture();
  stopDiagnostics = diagnostics ? () => diagnostics.stop() : undefined;
});

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  await settle();
  host?.remove();
  host = undefined;
  document.getElementById("headlessui-portal-root")?.remove();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  expect(stopDiagnostics?.() ?? []).toEqual([]);
  stopDiagnostics = undefined;
});

test("MainTreeProvider discovers its connected application root and reuses it when nested", async () => {
  let childInstances = 0;

  function Probe() {
    childInstances += 1;
    const mainTreeNode = useMainTreeNode();
    return <output id="main-tree-id">{mainTreeNode()?.id ?? "none"}</output>;
  }

  mount(() => (
    <MainTreeProvider>
      <MainTreeProvider>
        <Probe />
      </MainTreeProvider>
    </MainTreeProvider>
  ));
  await settle();

  expect(document.getElementById("main-tree-id")?.textContent).toBe(
    "overlay-test-app",
  );
  expect(childInstances).toBe(1);
});

test("on-disappear waits for a portalled node to connect and detects a later zero rect", async () => {
  type ObserverCallback = () => void;
  const callbacks: ObserverCallback[] = [];
  const observedConnected: boolean[] = [];
  let disconnects = 0;
  let zeroRect = false;
  let disappearances = 0;

  class TestResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      callbacks.push(() => callback([], this as unknown as ResizeObserver));
    }

    disconnect(): void {
      disconnects += 1;
    }

    observe(target: Element): void {
      observedConnected.push(target.isConnected);
    }

    unobserve(): void {}
  }

  vi.stubGlobal("ResizeObserver", TestResizeObserver);

  function Probe() {
    const [element, setElement] = createSignal<HTMLElement | null>(null, {
      ownedWrite: true,
    });
    createOnDisappear(
      () => true,
      element,
      () => disappearances += 1,
    );

    return (
      <Portal>
        <section
          id="disappear-probe"
          ref={(target) => {
            target.getBoundingClientRect = () => ({
              bottom: zeroRect ? 0 : 20,
              height: zeroRect ? 0 : 20,
              left: 0,
              right: zeroRect ? 0 : 20,
              top: 0,
              width: zeroRect ? 0 : 20,
              x: 0,
              y: 0,
              toJSON: () => ({}),
            });
            setElement(target);
          }}
        >
          Portalled content
        </section>
      </Portal>
    );
  }

  mount(() => <Probe />);
  await settle();

  expect(observedConnected).toEqual([true]);
  expect(callbacks).toHaveLength(1);
  callbacks[0]();
  expect(disappearances).toBe(0);

  zeroRect = true;
  callbacks[0]();
  expect(disappearances).toBe(1);
  expect(disconnects).toBe(0);

  dispose?.();
  dispose = undefined;
  await settle();

  expect(disconnects).toBe(1);
});
