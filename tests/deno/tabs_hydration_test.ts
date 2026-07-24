import { JSDOM } from "jsdom";
import { build, createServer } from "vite";
import solid from "vite-plugin-solid";
import type { TabsHydrationVariant } from "./tabs-hydration-entry.tsx";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function browserChunkCode(result: Awaited<ReturnType<typeof build>>): string {
  const groups = Array.isArray(result) ? result : [result];
  for (const group of groups) {
    if (!("output" in group)) continue;
    for (const output of group.output) {
      if (output.type === "chunk" && output.isEntry) return output.code;
    }
  }
  throw new Error("Vite did not return a Tabs hydration entry chunk");
}

async function settle(): Promise<void> {
  for (let pass = 0; pass < 12; pass++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

interface ServerFixtureModule {
  renderTabsHydrationFixture(variant: TabsHydrationVariant): string;
}

interface HydrationHandle {
  diagnosticDetails(): string[];
  dispose(): void;
}

interface HydrationHarness {
  assertTabsDiagnosticCapture(): void;
  hydrateTabsFixture(
    element: HTMLElement,
    variant: TabsHydrationVariant,
  ): HydrationHandle;
}

interface HydrationRuntime {
  completed: WeakSet<object>;
  events: unknown[];
  fe(): void;
  r: Record<string, unknown>;
}

async function runHydrationCase(
  variant: TabsHydrationVariant,
  expectedIndex: 0 | 1,
): Promise<void> {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    logLevel: "silent",
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const fixture = await server.ssrLoadModule(
      "/tests/deno/tabs-hydration-entry.tsx",
    ) as ServerFixtureModule;
    const serverHtml = fixture.renderTabsHydrationFixture(variant);
    assert(
      serverHtml.includes('id="tabs-hydration-shell"'),
      "SSR Tabs shell vanished",
    );
    assert(
      serverHtml.includes(`id="tabs-hydration-tab-${expectedIndex}"`),
      "SSR selected Tab vanished",
    );
    assert(
      serverHtml.includes(`Hydration content ${expectedIndex + 1}`),
      "SSR selected panel content vanished",
    );

    const entry = await Deno.realPath(
      "tests/deno/tabs-hydration-entry.tsx",
    );
    const clientBuild = await build({
      build: {
        lib: {
          entry,
          formats: ["iife"],
          name: "TabsHydrationHarness",
        },
        minify: false,
        write: false,
      },
      configFile: false,
      logLevel: "silent",
      mode: "development",
      plugins: [solid({ hot: false, ssr: true })],
      resolve: { conditions: ["browser", "development"] },
    });

    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      pretendToBeVisual: true,
      runScripts: "outside-only",
      url: "http://localhost/",
    });
    const view = dom.window as unknown as Window & typeof globalThis & {
      _$HY?: HydrationRuntime;
      TabsHydrationHarness?: HydrationHarness;
    };
    view._$HY = {
      completed: new view.WeakSet(),
      events: [],
      fe() {},
      r: {},
    };
    Object.defineProperty(view, "matchMedia", {
      configurable: true,
      value: () => ({
        addEventListener() {},
        matches: false,
        removeEventListener() {},
      }),
    });
    Object.defineProperty(view, "ResizeObserver", {
      configurable: true,
      value: class {
        disconnect() {}
        observe() {}
      },
    });
    Object.defineProperty(view, "IntersectionObserver", {
      configurable: true,
      value: class {
        disconnect() {}
        observe() {}
      },
    });

    const errors: string[] = [];
    view.console.error = (...values: unknown[]) => {
      errors.push(values.map(String).join(" "));
    };
    view.console.warn = (...values: unknown[]) => {
      errors.push(values.map(String).join(" "));
    };

    const host = view.document.createElement("div");
    host.id = "tabs-hydration-host";
    host.innerHTML = serverHtml;
    view.document.body.append(host);
    const firstTab = view.document.getElementById("tabs-hydration-tab-0");
    const selectedPanel = view.document.getElementById(
      `tabs-hydration-panel-${expectedIndex}`,
    );

    view.eval(browserChunkCode(clientBuild));
    const harness = view.TabsHydrationHarness;
    assert(harness, "Client Tabs hydration harness did not initialize");
    harness.assertTabsDiagnosticCapture();
    const handle = harness.hydrateTabsFixture(host, variant);
    await settle();

    assert(
      view.document.getElementById("tabs-hydration-tab-0") === firstTab,
      "Hydration replaced a server-rendered Tab",
    );
    assert(
      view.document.getElementById(`tabs-hydration-panel-${expectedIndex}`) ===
        selectedPanel,
      "Hydration replaced the selected server-rendered TabPanel",
    );
    assert(
      view.document.querySelectorAll("#tabs-hydration-shell").length === 1,
      "Hydration duplicated the Tabs shell",
    );
    assert(
      view.document.querySelectorAll('[role="tab"]').length === 3,
      "Hydration duplicated or removed a Tab",
    );
    const tabs = view.document.querySelectorAll<HTMLElement>('[role="tab"]');
    assert(
      tabs[expectedIndex]?.getAttribute("aria-selected") === "true",
      "Hydration changed the selected Tab",
    );
    assert(
      view.document.getElementById("tabs-hydration-index")?.textContent ===
        String(expectedIndex),
      "Hydration changed the selected index slot",
    );
    assert(
      view.document.body.textContent?.includes(
        `Hydration content ${expectedIndex + 1}`,
      ),
      "Hydration removed selected panel content",
    );
    handle.dispose();
    await settle();
    const diagnosticDetails = handle.diagnosticDetails();
    assert(
      diagnosticDetails.length === 0,
      `Solid emitted hydration diagnostics: ${diagnosticDetails.join("\n")}`,
    );
    assert(errors.length === 0, `Hydration diagnostics: ${errors.join("\n")}`);
    dom.window.close();
  } finally {
    await server.close();
  }
}

const cases: readonly [
  name: string,
  variant: TabsHydrationVariant,
  expectedIndex: 0 | 1,
][] = [
  [
    "should be possible to server side render the first Tab and Panel by default",
    "default",
    0,
  ],
  [
    "should be possible to server side render the first Tab and Panel",
    "default-0",
    0,
  ],
  [
    "should be possible to server side render the defaultIndex Tab and Panel",
    "default-1",
    1,
  ],
  [
    "should be possible to server side render the selectedIndex=0 Tab and Panel",
    "selected-0",
    0,
  ],
  [
    "should be possible to server side render the selectedIndex=1 Tab and Panel",
    "selected-1",
    1,
  ],
];

for (const [name, variant, expectedIndex] of cases) {
  Deno.test(`Tabs hydration: ${name}`, () =>
    runHydrationCase(variant, expectedIndex));
}
