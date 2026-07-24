import { JSDOM } from "jsdom";
import { build, createServer } from "vite";
import solid from "vite-plugin-solid";

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
  throw new Error("Vite did not return a client hydration entry chunk");
}

async function settle(): Promise<void> {
  for (let pass = 0; pass < 12; pass++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

interface ServerFixtureModule {
  renderDialogHydrationFixture(): string;
}

interface HydrationHarness {
  assertDialogDiagnosticCapture(): void;
  hydrateDialogFixture(element: HTMLElement): {
    diagnosticDetails(): string[];
    dispose(): void;
  };
}

interface HydrationRuntime {
  completed: WeakSet<object>;
  events: unknown[];
  fe(): void;
  r: Record<string, unknown>;
}

Deno.test("an initially-open Dialog hydrates its server-safe shell into one interactive portal", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    logLevel: "silent",
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const fixture = await server.ssrLoadModule(
      "/tests/deno/dialog-hydration-entry.tsx",
    ) as ServerFixtureModule;
    const serverHtml = fixture.renderDialogHydrationFixture();
    assert(serverHtml.includes('id="hydration-shell"'), "SSR shell vanished");
    assert(serverHtml.includes('id="hydration-opener"'), "SSR opener vanished");
    assert(serverHtml.includes('id="hydration-tail"'), "SSR tail vanished");
    assert(
      !serverHtml.includes('role="dialog"'),
      "SSR emitted a Dialog portal",
    );
    assert(
      !serverHtml.includes("Hydrated title"),
      "SSR emitted Dialog content",
    );

    const entry = await Deno.realPath(
      "tests/deno/dialog-hydration-entry.tsx",
    );
    const clientBuild = await build({
      build: {
        lib: {
          entry,
          formats: ["iife"],
          name: "DialogHydrationHarness",
        },
        minify: false,
        write: false,
      },
      configFile: false,
      logLevel: "silent",
      mode: "development",
      plugins: [solid({ hot: false, ssr: true })],
      resolve: {
        // A production Vite build resolves Solid's diagnostics-free runtime.
        // This test must execute against the development condition so its
        // programmatic diagnostic assertion cannot silently become a no-op.
        conditions: ["development", "browser"],
      },
    });

    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      pretendToBeVisual: true,
      runScripts: "outside-only",
      url: "http://localhost/",
    });
    const view = dom.window as unknown as Window & typeof globalThis & {
      _$HY?: HydrationRuntime;
      DialogHydrationHarness?: HydrationHarness;
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
    host.id = "hydration-host";
    host.innerHTML = serverHtml;
    view.document.body.append(host);
    const opener = view.document.getElementById("hydration-opener")!;

    view.eval(browserChunkCode(clientBuild));
    const harness = view.DialogHydrationHarness;
    assert(harness, "Client hydration harness did not initialize");
    harness.assertDialogDiagnosticCapture();
    const handle = harness.hydrateDialogFixture(host);
    await settle();

    assert(
      view.document.getElementById("hydration-opener") === opener,
      "Hydration replaced the server-rendered opener",
    );
    assert(
      view.document.querySelectorAll("#hydration-shell").length === 1,
      "Hydration duplicated the server shell",
    );
    const dialog = view.document.querySelector<HTMLElement>("[role=dialog]");
    assert(dialog, "Initially-open Dialog did not mount during hydration");
    assert(
      dialog.getAttribute("aria-labelledby") === "hydration-title",
      "Hydrated Dialog lost its title relationship",
    );
    assert(
      view.document.querySelectorAll("#headlessui-portal-root").length === 1,
      "Hydration created an invalid number of managed portal roots",
    );
    assert(
      view.document.querySelectorAll("#hydration-panel").length === 1,
      "Hydration duplicated the Dialog panel",
    );

    view.document.getElementById("hydration-close")!.click();
    await settle();
    assert(
      view.document.querySelectorAll("[role=dialog]").length === 0,
      "Hydrated Dialog did not close",
    );
    opener.click();
    await settle();
    assert(
      view.document.querySelectorAll("[role=dialog]").length === 1,
      "Hydrated opener did not remount exactly one Dialog",
    );
    view.document.getElementById("hydration-close")!.click();
    await settle();
    handle.dispose();
    await settle();
    assert(
      view.document.querySelectorAll("#headlessui-portal-root").length === 0,
      "Dialog hydration disposal leaked its managed portal root",
    );
    const diagnosticDetails = handle.diagnosticDetails();
    assert(
      diagnosticDetails.length === 0,
      `Solid hydration diagnostics: ${diagnosticDetails.join("\n")}`,
    );
    assert(errors.length === 0, `Hydration diagnostics: ${errors.join("\n")}`);

    dom.window.close();
  } finally {
    await server.close();
  }
});
