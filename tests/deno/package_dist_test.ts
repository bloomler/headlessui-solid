import {
  createComponent,
  renderToString as solidRenderToString,
} from "@solidjs/web";
import { JSDOM } from "jsdom";
import packlist from "npm-packlist";
import { build, createServer, type Plugin, type Rollup } from "vite";
import solid from "vite-plugin-solid";

const expectedRuntimeExports = [
  "Button",
  "Checkbox",
  "CloseButton",
  "Combobox",
  "ComboboxButton",
  "ComboboxInput",
  "ComboboxLabel",
  "ComboboxOption",
  "ComboboxOptions",
  "DataInteractive",
  "Description",
  "Dialog",
  "DialogBackdrop",
  "DialogDescription",
  "DialogPanel",
  "DialogTitle",
  "Disclosure",
  "DisclosureButton",
  "DisclosurePanel",
  "Field",
  "Fieldset",
  "FocusTrap",
  "FocusTrapFeatures",
  "Input",
  "Label",
  "Legend",
  "Listbox",
  "ListboxButton",
  "ListboxLabel",
  "ListboxOption",
  "ListboxOptions",
  "ListboxSelectedOption",
  "Menu",
  "MenuButton",
  "MenuHeading",
  "MenuItem",
  "MenuItems",
  "MenuSection",
  "MenuSeparator",
  "Popover",
  "PopoverBackdrop",
  "PopoverButton",
  "PopoverGroup",
  "PopoverOverlay",
  "PopoverPanel",
  "Portal",
  "Radio",
  "RadioGroup",
  "RadioGroupDescription",
  "RadioGroupLabel",
  "RadioGroupOption",
  "Select",
  "Switch",
  "SwitchDescription",
  "SwitchGroup",
  "SwitchLabel",
  "Tab",
  "TabGroup",
  "TabList",
  "TabPanel",
  "TabPanels",
  "Textarea",
  "Transition",
  "TransitionChild",
  "useClose",
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function entryChunk(
  result: Awaited<ReturnType<typeof build>>,
): Rollup.OutputChunk {
  const groups = Array.isArray(result) ? result : [result];
  for (const group of groups) {
    if (!("output" in group)) continue;
    for (const output of group.output) {
      if (output.type === "chunk" && output.isEntry) return output;
    }
  }
  throw new Error("Vite did not return a package consumer entry chunk");
}

async function settle(): Promise<void> {
  for (let pass = 0; pass < 12; pass++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

interface PackageHydrationServerModule {
  renderPackageHydrationFixture(): string;
}

interface PackageHydrationHandle {
  diagnosticDetails(): string[];
  dispose(): void;
  flush(): void;
}

interface PackageHydrationHarness {
  assertPackageBrowserDiagnosticCapture(): void;
  hydratePackageFixture(element: HTMLElement): PackageHydrationHandle;
}

interface HydrationRuntime {
  completed: WeakSet<object>;
  events: unknown[];
  fe(): void;
  r: Record<string, unknown>;
}

Deno.test("the package routes browser and server consumers to matching builds", async () => {
  const packageUrl = new URL("../../package.json", import.meta.url);
  const manifest = JSON.parse(await Deno.readTextFile(packageUrl)) as {
    exports: {
      ".": Record<string, string>;
    };
  };
  const entry = manifest.exports["."];

  assert(
    entry.browser === "./dist/index.browser.mjs",
    "Expected browser consumers to receive the DOM build",
  );
  assert(
    entry.import === "./dist/index.browser.mjs",
    "Expected the generic ESM fallback to receive the DOM build",
  );
  assert(
    entry.types === "./src/index.ts",
    "Expected consumers to retain the source declarations",
  );
  for (const condition of ["deno", "node", "worker"]) {
    assert(
      entry[condition] === "./dist/index.mjs",
      `Expected ${condition} consumers to receive the SSR build`,
    );
  }
});

Deno.test("Vite resolves every advertised package condition to the shipped artifact", async () => {
  const importer = await Deno.realPath(
    "tests/deno/package-browser-consumer-entry.tsx",
  );
  const cases = [
    ["browser", false, "index.browser.mjs"],
    ["worker", true, "index.mjs"],
    ["node", true, "index.mjs"],
    ["deno", true, "index.mjs"],
  ] as const;

  for (const [condition, ssr, expectedFile] of cases) {
    const server = await createServer({
      configFile: false,
      logLevel: "silent",
      resolve: { conditions: [condition] },
      server: { middlewareMode: true },
    });
    try {
      const resolved = await server.pluginContainer.resolveId(
        "@bloomler/headlessui-solid",
        importer,
        { ssr },
      );
      assert(resolved, `Vite did not resolve the ${condition} condition`);
      assert(
        resolved.id.replaceAll("\\", "/").endsWith(`/dist/${expectedFile}`),
        `Expected ${condition} to resolve to ${expectedFile}, got ${resolved.id}`,
      );
    } finally {
      await server.close();
    }
  }
});

Deno.test("the packed package contains every public runtime and type target", async () => {
  const packageDirectory = await Deno.realPath(
    ".",
  );
  const manifest = JSON.parse(
    await Deno.readTextFile(`${packageDirectory}/package.json`),
  ) as Record<string, unknown>;
  const files = new Set(
    await packlist({
      edgesOut: new Map(),
      isProjectRoot: true,
      package: manifest,
      path: packageDirectory,
      workspaces: null,
    }) as string[],
  );
  for (
    const expected of [
      "CHANGELOG.md",
      "LICENSE",
      "NOTICE.md",
      "README.md",
      "package.json",
      "dist/index.browser.mjs",
      "dist/index.browser.mjs.map",
      "dist/index.mjs",
      "dist/index.mjs.map",
      "src/index.ts",
    ]
  ) {
    assert(files.has(expected), `Packed package omitted ${expected}`);
  }
  assert(
    [...files].some((file) => file.startsWith("src/components/")),
    "Packed package omitted component type sources",
  );
  assert(
    ![...files].some((file) => file.startsWith("tests/")),
    "Packed package unexpectedly contains tests",
  );
});

Deno.test("the browser distribution is tree-shaken and executes as a package consumer", async () => {
  let resolvedPackageEntry = "";
  const capturePackageResolution: Plugin = {
    enforce: "pre",
    name: "capture-package-resolution",
    async resolveId(source, importer) {
      if (source !== "@bloomler/headlessui-solid") return null;
      const resolved = await this.resolve(source, importer, {
        skipSelf: true,
      });
      resolvedPackageEntry = resolved?.id ?? "";
      return resolved;
    },
  };
  const entry = await Deno.realPath(
    "tests/deno/package-browser-consumer-entry.tsx",
  );
  const clientBuild = await build({
    build: {
      lib: {
        entry,
        formats: ["iife"],
        name: "HeadlessUIPackageConsumer",
      },
      minify: false,
      write: false,
    },
    configFile: false,
    logLevel: "silent",
    plugins: [capturePackageResolution, solid({ hot: false })],
    resolve: { conditions: ["browser"] },
  });
  const chunk = entryChunk(clientBuild);
  assert(
    resolvedPackageEntry.replaceAll("\\", "/").endsWith(
      "/dist/index.browser.mjs",
    ),
    `Browser consumer bypassed the shipped DOM build: ${resolvedPackageEntry}`,
  );
  assert(
    !chunk.code.includes("ComboboxOptions") &&
      !chunk.code.includes("DialogPanel"),
    "Button-only consumer retained unrelated component families",
  );

  const surfaceEntry = await Deno.realPath(
    "tests/deno/package-browser-surface-entry.ts",
  );
  const surfaceBuild = await build({
    build: {
      lib: {
        entry: surfaceEntry,
        formats: ["es"],
      },
      minify: false,
      write: false,
    },
    configFile: false,
    logLevel: "silent",
    plugins: [solid({ hot: false })],
    resolve: { conditions: ["browser"] },
  });
  const browserExports = entryChunk(surfaceBuild).exports.sort((a, z) =>
    a.localeCompare(z)
  );
  const expectedExports = [...expectedRuntimeExports].sort((a, z) =>
    a.localeCompare(z)
  );
  assert(
    JSON.stringify(browserExports) === JSON.stringify(expectedExports),
    `Unexpected browser artifact exports:\n${
      JSON.stringify(browserExports, null, 2)
    }`,
  );

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "http://localhost/",
  });
  const view = dom.window as unknown as Window & typeof globalThis & {
    HeadlessUIPackageConsumer?: {
      mountPackageBrowserConsumer(element: HTMLElement): {
        dispose(): void;
      };
    };
  };
  const errors: string[] = [];
  view.console.error = (...values: unknown[]) => {
    errors.push(values.map(String).join(" "));
  };
  view.console.warn = (...values: unknown[]) => {
    errors.push(values.map(String).join(" "));
  };
  const host = view.document.createElement("div");
  view.document.body.append(host);

  view.eval(chunk.code);
  const consumer = view.HeadlessUIPackageConsumer;
  assert(consumer, "Browser package consumer did not initialize");
  const handle = consumer.mountPackageBrowserConsumer(host);
  await settle();
  const button = view.document.getElementById("package-browser-button");
  assert(button, "Browser distribution did not render Button");
  assert(
    button.textContent === "Packaged button",
    "Browser distribution changed Button content",
  );
  button.click();
  await settle();
  assert(
    view.document.getElementById("package-browser-clicks")?.textContent === "1",
    "Browser distribution did not preserve client reactivity",
  );
  handle.dispose();
  await settle();
  assert(host.childNodes.length === 0, "Browser consumer did not dispose");
  assert(errors.length === 0, `Browser package errors: ${errors.join("\n")}`);
  dom.window.close();
});

Deno.test("the shipped server and browser artifacts hydrate together", async () => {
  let resolvedServerPackageEntry = "";
  const captureServerPackageResolution: Plugin = {
    enforce: "pre",
    name: "capture-server-package-resolution",
    async resolveId(source, importer) {
      if (source !== "@bloomler/headlessui-solid") return null;
      const resolved = await this.resolve(source, importer, {
        skipSelf: true,
      });
      resolvedServerPackageEntry = resolved?.id ?? "";
      return resolved;
    },
  };
  const server = await createServer({
    appType: "custom",
    configFile: false,
    logLevel: "silent",
    plugins: [
      captureServerPackageResolution,
      solid({ hot: false, ssr: true }),
    ],
    resolve: { conditions: ["node"] },
    server: { middlewareMode: true },
  });
  let dom: JSDOM | undefined;

  try {
    const fixture = await server.ssrLoadModule(
      "/tests/deno/package-hydration-server-entry.tsx",
    ) as PackageHydrationServerModule;
    const serverHtml = fixture.renderPackageHydrationFixture();
    assert(
      resolvedServerPackageEntry.replaceAll("\\", "/").endsWith(
        "/dist/index.mjs",
      ),
      `SSR hydration consumer bypassed the shipped server artifact: ${resolvedServerPackageEntry}`,
    );
    assert(
      serverHtml.includes('id="package-hydration-consumer"'),
      "Packaged SSR hydration shell vanished",
    );
    assert(
      serverHtml.includes("Packaged disclosure contents"),
      "Packaged SSR output omitted its open Disclosure",
    );

    let resolvedBrowserPackageEntry = "";
    let diagnosticSolidRuntime = "";
    let shippedSolidRuntime = "";
    const captureBrowserPackageResolution: Plugin = {
      enforce: "pre",
      name: "capture-browser-package-resolution",
      async resolveId(source, importer) {
        if (
          source !== "@bloomler/headlessui-solid" &&
          source !== "solid-js"
        ) {
          return null;
        }
        const resolved = await this.resolve(source, importer, {
          skipSelf: true,
        });
        if (source === "@bloomler/headlessui-solid") {
          resolvedBrowserPackageEntry = resolved?.id ?? "";
        } else if (importer) {
          const normalizedImporter = importer.replaceAll("\\", "/").split(
            "?",
            1,
          )[0];
          if (normalizedImporter.endsWith("/solid-diagnostics.ts")) {
            diagnosticSolidRuntime = resolved?.id ?? "";
          } else if (
            normalizedImporter.endsWith("/dist/index.browser.mjs")
          ) {
            shippedSolidRuntime = resolved?.id ?? "";
          }
        }
        return resolved;
      },
    };
    const entry = await Deno.realPath(
      "tests/deno/package-hydration-browser-entry.tsx",
    );
    const clientBuild = await build({
      build: {
        lib: {
          entry,
          formats: ["iife"],
          name: "PackagedHydrationHarness",
        },
        minify: false,
        write: false,
      },
      configFile: false,
      logLevel: "silent",
      mode: "development",
      plugins: [
        captureBrowserPackageResolution,
        solid({ hot: false, ssr: true }),
      ],
      resolve: { conditions: ["browser", "development"] },
    });
    assert(
      resolvedBrowserPackageEntry.replaceAll("\\", "/").endsWith(
        "/dist/index.browser.mjs",
      ),
      `Hydration consumer bypassed the shipped browser artifact: ${resolvedBrowserPackageEntry}`,
    );
    assert(
      diagnosticSolidRuntime.length > 0 && shippedSolidRuntime.length > 0,
      "Hydration build did not resolve both the diagnostic and shipped component Solid runtimes",
    );
    assert(
      diagnosticSolidRuntime === shippedSolidRuntime,
      `Diagnostic capture used a different Solid runtime than the shipped component artifact:\n${diagnosticSolidRuntime}\n${shippedSolidRuntime}`,
    );

    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      pretendToBeVisual: true,
      runScripts: "outside-only",
      url: "http://localhost/",
    });
    const view = dom.window as unknown as Window & typeof globalThis & {
      _$HY?: HydrationRuntime;
      PackagedHydrationHarness?: PackageHydrationHarness;
    };
    view._$HY = {
      completed: new view.WeakSet(),
      events: [],
      fe() {},
      r: {},
    };
    const errors: string[] = [];
    view.console.error = (...values: unknown[]) => {
      errors.push(values.map(String).join(" "));
    };
    view.console.warn = (...values: unknown[]) => {
      errors.push(values.map(String).join(" "));
    };

    const host = view.document.createElement("div");
    host.innerHTML = serverHtml;
    view.document.body.append(host);
    const serverNodes = new Map<string, Element>();
    for (
      const element of host.querySelectorAll<Element>(
        "[data-package-hydration-node]",
      )
    ) {
      const marker = element.getAttribute("data-package-hydration-node");
      assert(marker, "Packaged hydration marker is empty");
      serverNodes.set(marker, element);
    }
    assert(serverNodes.size === 5, "Packaged SSR identity coverage changed");

    view.eval(entryChunk(clientBuild).code);
    const harness = view.PackagedHydrationHarness;
    assert(harness, "Packaged browser hydration harness did not initialize");
    harness.assertPackageBrowserDiagnosticCapture();
    const handle = harness.hydratePackageFixture(host);
    handle.flush();
    await settle();
    handle.flush();

    for (const [marker, serverNode] of serverNodes) {
      assert(
        host.querySelector(`[data-package-hydration-node="${marker}"]`) ===
          serverNode,
        `Packaged hydration replaced the ${marker} node`,
      );
    }
    const disclosureButton = host.querySelector<HTMLButtonElement>(
      '[data-package-hydration-node="disclosure-button"]',
    );
    assert(disclosureButton, "Packaged Disclosure button vanished");
    const panelId = disclosureButton.getAttribute("aria-controls");
    assert(panelId, "Packaged Disclosure button lost aria-controls");
    assert(
      view.document.getElementById(panelId),
      `Packaged Disclosure referenced missing panel #${panelId}`,
    );

    host.querySelector<HTMLButtonElement>("#package-hydration-counter")!
      .click();
    handle.flush();
    await settle();
    assert(
      host.querySelector("#package-hydration-clicks")?.textContent === "1",
      "Packaged hydrated Button did not update reactive state",
    );

    disclosureButton.click();
    handle.flush();
    await settle();
    assert(
      host.querySelector("#package-hydration-disclosure-state")?.textContent ===
        "closed",
      "Packaged hydrated Disclosure did not close",
    );
    assert(
      view.document.getElementById(panelId) === null,
      "Packaged hydrated Disclosure did not unmount its panel",
    );

    handle.dispose();
    await settle();
    const diagnosticDetails = handle.diagnosticDetails();
    assert(
      diagnosticDetails.length === 0,
      `Packaged hydration diagnostics: ${diagnosticDetails.join("\n")}`,
    );
    assert(
      errors.length === 0,
      `Packaged hydration console errors: ${errors.join("\n")}`,
    );
  } finally {
    dom?.window.close();
    await server.close();
  }
});

Deno.test("the server distribution exposes exactly 65 runtime exports and renders", async () => {
  const moduleUrl = new URL("../../dist/index.mjs", import.meta.url);
  const HeadlessUI = await import(moduleUrl.href);
  const expectedExports = [...expectedRuntimeExports].sort((a, z) =>
    a.localeCompare(z)
  );

  assert(
    expectedRuntimeExports.length === 65,
    `Expected the compatibility baseline to contain 65 exports, got ${expectedRuntimeExports.length}`,
  );
  const actualExports = Object.keys(HeadlessUI).sort((a, z) =>
    a.localeCompare(z)
  );
  assert(
    JSON.stringify(actualExports) === JSON.stringify(expectedExports),
    `Unexpected server artifact exports:\n${
      JSON.stringify(actualExports, null, 2)
    }`,
  );

  // This assertion intentionally exercises Deno's production server condition.
  // The hydration test above separately proves the browser DEV diagnostic path.
  const html = solidRenderToString(() =>
    createComponent(HeadlessUI.Button, { children: "Save changes" })
  );
  assert(html.includes("<button"), `Expected a button in ${html}`);
  assert(html.includes("Save changes"), `Expected button content in ${html}`);
});
