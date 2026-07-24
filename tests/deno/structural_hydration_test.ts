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
  throw new Error("Vite did not return a structural hydration entry chunk");
}

interface ServerFixtureModule {
  renderStructuralHydrationFixture(): string;
}

interface HydrationHandle {
  diagnosticDetails(): string[];
  dispose(): void;
  frame(): Promise<void>;
  flush(): void;
}

interface HydrationHarness {
  assertStructuralDiagnosticCapture(): void;
  hydrateStructuralFixture(element: HTMLElement): HydrationHandle;
}

interface HydrationRuntime {
  completed: WeakSet<object>;
  events: unknown[];
  fe(): void;
  r: Record<string, unknown>;
}

async function settle(handle?: HydrationHandle): Promise<void> {
  handle?.flush();
  for (let pass = 0; pass < 12; pass++) await Promise.resolve();
  if (handle) await handle.frame();
  await new Promise((resolve) => setTimeout(resolve, 0));
  handle?.flush();
}

function required<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  assert(element, `Missing required element: ${selector}`);
  return element;
}

function markedNodes(root: ParentNode): Map<string, Element> {
  const result = new Map<string, Element>();
  for (
    const element of root.querySelectorAll<Element>("[data-hydration-node]")
  ) {
    const marker = element.getAttribute("data-hydration-node");
    assert(marker, "Hydration identity marker is empty");
    assert(!result.has(marker), `Duplicate hydration marker: ${marker}`);
    result.set(marker, element);
  }
  return result;
}

function generatedIdNodes(root: ParentNode): Map<string, Element> {
  const result = new Map<string, Element>();
  for (const element of root.querySelectorAll<Element>('[id^="headlessui-"]')) {
    assert(!result.has(element.id), `Duplicate generated ID: ${element.id}`);
    result.set(element.id, element);
  }
  return result;
}

function assertIdReferencesResolve(document: Document): void {
  let references = 0;
  for (
    const attribute of [
      "aria-controls",
      "aria-describedby",
      "aria-labelledby",
    ]
  ) {
    for (const element of document.querySelectorAll(`[${attribute}]`)) {
      const ids =
        element.getAttribute(attribute)?.split(/\s+/).filter(Boolean) ??
          [];
      for (const id of ids) {
        references += 1;
        assert(
          document.getElementById(id),
          `${attribute} on ${element.tagName} references missing #${id}`,
        );
      }
    }
  }
  assert(references >= 12, "Too few generated ARIA relationships were tested");
}

function assertState(
  document: Document,
  name: string,
  expected: string,
): void {
  const output = required<HTMLOutputElement>(
    document,
    `[data-state="${name}"]`,
  );
  assert(
    output.textContent === expected,
    `${name} state was ${JSON.stringify(output.textContent)}, expected ${
      JSON.stringify(expected)
    }`,
  );
}

function assertFormValue(
  data: FormData,
  name: string,
  expected: string | null,
): void {
  const value = data.get(name);
  assert(
    value === expected,
    `${name} form value was ${JSON.stringify(value)}, expected ${
      JSON.stringify(expected)
    }`,
  );
}

Deno.test("structural and ID-sensitive families hydrate in place and remain interactive", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    logLevel: "silent",
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });
  let dom: JSDOM | undefined;

  try {
    const fixture = await server.ssrLoadModule(
      "/tests/deno/structural-hydration-entry.tsx",
    ) as ServerFixtureModule;
    const serverHtml = fixture.renderStructuralHydrationFixture();
    assert(
      serverHtml.includes('data-hydration-shell="structural-families"'),
      "SSR structural hydration shell vanished",
    );
    assert(
      !serverHtml.includes('data-hydration-node="portal-content"'),
      "SSR emitted client-only Portal content",
    );
    for (
      const family of [
        "portal",
        "transition",
        "focus-trap",
        "popover",
        "disclosure",
        "menu",
        "listbox",
        "combobox",
        "form-controls",
      ]
    ) {
      assert(
        serverHtml.includes(`data-family="${family}"`),
        `SSR omitted the ${family} family`,
      );
    }

    const entry = await Deno.realPath(
      "tests/deno/structural-hydration-entry.tsx",
    );
    const clientBuild = await build({
      build: {
        lib: {
          entry,
          formats: ["iife"],
          name: "StructuralHydrationHarness",
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

    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      pretendToBeVisual: true,
      runScripts: "outside-only",
      url: "http://localhost/",
    });
    const view = dom.window as unknown as Window & typeof globalThis & {
      _$HY?: HydrationRuntime;
      StructuralHydrationHarness?: HydrationHarness;
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
    Object.defineProperty(view.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value() {},
    });

    const consoleErrors: string[] = [];
    view.console.error = (...values: unknown[]) => {
      consoleErrors.push(values.map(String).join(" "));
    };
    view.console.warn = (...values: unknown[]) => {
      consoleErrors.push(values.map(String).join(" "));
    };

    const host = view.document.createElement("div");
    host.id = "structural-hydration-host";
    host.innerHTML = serverHtml;
    view.document.body.append(host);

    const serverMarkedNodes = markedNodes(host);
    const serverGeneratedIdNodes = generatedIdNodes(host);
    assert(
      serverMarkedNodes.size >= 25,
      "The SSR fixture did not expose every family identity",
    );
    assert(
      serverGeneratedIdNodes.size >= 25,
      "The SSR fixture did not exercise enough generated IDs",
    );
    assert(
      host.querySelectorAll("[data-family]").length === 9,
      "The SSR fixture rendered an invalid family count",
    );
    assert(
      host.querySelectorAll("[data-headlessui-focus-guard]").length === 0,
      "Disabled SSR FocusTrap unexpectedly emitted focus guards",
    );

    view.eval(browserChunkCode(clientBuild));
    const harness = view.StructuralHydrationHarness;
    assert(harness, "Client structural hydration harness did not initialize");
    harness.assertStructuralDiagnosticCapture();
    const handle = harness.hydrateStructuralFixture(host);
    await settle(handle);

    assert(
      host.querySelectorAll("[data-family]").length === 9,
      "Hydration duplicated or removed a component family",
    );
    for (const [marker, serverNode] of serverMarkedNodes) {
      const hydratedNode = required(
        view.document,
        `[data-hydration-node="${marker}"]`,
      );
      assert(
        hydratedNode === serverNode,
        `Hydration replaced the server-rendered ${marker} node`,
      );
    }
    assert(
      generatedIdNodes(host).size === serverGeneratedIdNodes.size,
      "Hydration changed the number of server-generated IDs",
    );
    for (const [id, serverNode] of serverGeneratedIdNodes) {
      assert(
        view.document.getElementById(id) === serverNode,
        `Hydration replaced or renamed generated #${id}`,
      );
    }
    assertIdReferencesResolve(view.document);
    const hydrationForm = required<HTMLFormElement>(
      host,
      "#structural-hydration-form",
    );
    let formData = new view.FormData(hydrationForm);
    assertFormValue(formData, "listbox-person", "Alpha");
    assertFormValue(formData, "combobox-person", "Alpha");
    assertFormValue(formData, "terms", null);
    assertFormValue(formData, "notifications", null);
    assertFormValue(formData, "delivery", "Alpha");
    assertFormValue(formData, "input", "server input");
    assertFormValue(formData, "select", "alpha");
    assertFormValue(formData, "textarea", "server textarea");

    const portalContent = required<HTMLElement>(
      view.document,
      '[data-hydration-node="portal-content"]',
    );
    assert(
      !host.contains(portalContent),
      "Hydrated Portal content remained inside its logical parent",
    );
    assert(
      view.document.querySelectorAll("#headlessui-portal-root").length === 1,
      "Hydration did not create exactly one managed Portal root",
    );
    required<HTMLButtonElement>(
      view.document,
      '[data-action="portal-increment"]',
    ).click();
    await settle(handle);
    assertState(view.document, "portal", "1");

    const transition = required<HTMLElement>(
      host,
      '[data-hydration-node="transition"]',
    );
    required<HTMLButtonElement>(
      host,
      '[data-action="transition-toggle"]',
    ).click();
    await settle(handle);
    assertState(view.document, "transition", "hidden");
    assert(transition.hidden, "Retained Transition did not become hidden");
    assert(
      required(host, '[data-hydration-node="transition"]') === transition,
      "Transition toggle replaced its hydrated element",
    );
    required<HTMLButtonElement>(
      host,
      '[data-action="transition-toggle"]',
    ).click();
    await settle(handle);
    assertState(view.document, "transition", "visible");
    assert(!transition.hidden, "Retained Transition did not become visible");

    const focusTrap = required<HTMLElement>(
      host,
      '[data-hydration-node="focus-trap"]',
    );
    required<HTMLButtonElement>(
      host,
      '[data-action="focus-trap-increment"]',
    ).click();
    await settle(handle);
    assertState(view.document, "focus-trap", "1");
    required<HTMLButtonElement>(
      host,
      '[data-action="focus-trap-toggle"]',
    ).click();
    await settle(handle);
    assert(
      host.querySelectorAll("[data-headlessui-focus-guard]").length === 2,
      "Enabling FocusTrap TabLock did not mount both guards",
    );
    assert(
      view.document.activeElement ===
        required(host, '[data-action="focus-trap-increment"]'),
      "FocusTrap did not focus its explicit initial target",
    );
    assert(
      required(host, '[data-hydration-node="focus-trap"]') === focusTrap,
      "FocusTrap feature update replaced its hydrated container",
    );
    required<HTMLButtonElement>(
      host,
      '[data-action="focus-trap-toggle"]',
    ).click();
    await settle(handle);
    assert(
      host.querySelectorAll("[data-headlessui-focus-guard]").length === 0,
      "Disabling FocusTrap TabLock did not remove its guards",
    );

    const popoverButton = required<HTMLButtonElement>(
      host,
      '[data-hydration-node="popover-button"]',
    );
    const popoverPanel = required<HTMLElement>(
      host,
      '[data-hydration-node="popover-panel"]',
    );
    popoverButton.click();
    await settle(handle);
    assertState(view.document, "popover", "open");
    assert(
      popoverButton.getAttribute("aria-expanded") === "true" &&
        !popoverPanel.hidden,
      "Hydrated Popover did not open",
    );
    required<HTMLButtonElement>(
      host,
      '[data-action="popover-close"]',
    ).click();
    await settle(handle);
    assertState(view.document, "popover", "closed");
    assert(popoverPanel.hidden, "Hydrated Popover did not close");

    const disclosureButton = required<HTMLButtonElement>(
      host,
      '[data-hydration-node="disclosure-button"]',
    );
    const disclosurePanel = required<HTMLElement>(
      host,
      '[data-hydration-node="disclosure-panel"]',
    );
    disclosureButton.click();
    await settle(handle);
    assertState(view.document, "disclosure", "open");
    assert(!disclosurePanel.hidden, "Hydrated Disclosure did not open");
    disclosureButton.click();
    await settle(handle);
    assertState(view.document, "disclosure", "closed");
    assert(disclosurePanel.hidden, "Hydrated Disclosure did not close");

    const menuButton = required<HTMLButtonElement>(
      host,
      '[data-hydration-node="menu-button"]',
    );
    const menuItems = required<HTMLElement>(
      host,
      '[data-hydration-node="menu-items"]',
    );
    menuButton.click();
    await settle(handle);
    assertState(view.document, "menu-open", "open");
    assert(!menuItems.hidden, "Hydrated Menu did not open");
    required<HTMLElement>(
      host,
      '[data-hydration-node="menu-item"]',
    ).click();
    await settle(handle);
    assertState(view.document, "menu-selection", "Profile");
    assertState(view.document, "menu-open", "closed");
    assert(menuItems.hidden, "Hydrated Menu did not close after selection");

    const listboxButton = required<HTMLButtonElement>(
      host,
      '[data-hydration-node="listbox-button"]',
    );
    const listboxOptions = required<HTMLElement>(
      host,
      '[data-hydration-node="listbox-options"]',
    );
    listboxButton.click();
    await settle(handle);
    assertState(view.document, "listbox-open", "open");
    assert(!listboxOptions.hidden, "Hydrated Listbox did not open");
    required<HTMLElement>(
      host,
      '[data-hydration-node="listbox-option-bravo"]',
    ).click();
    await settle(handle);
    assertState(view.document, "listbox-selection", "Bravo");
    assertState(view.document, "listbox-open", "closed");
    assert(
      listboxOptions.hidden,
      "Hydrated Listbox did not close after selection",
    );

    const comboboxButton = required<HTMLButtonElement>(
      host,
      '[data-hydration-node="combobox-button"]',
    );
    const comboboxOptions = required<HTMLElement>(
      host,
      '[data-hydration-node="combobox-options"]',
    );
    comboboxButton.click();
    await settle(handle);
    assertState(view.document, "combobox-open", "open");
    assert(!comboboxOptions.hidden, "Hydrated Combobox did not open");
    required<HTMLElement>(
      host,
      '[data-hydration-node="combobox-option-bravo"]',
    ).dispatchEvent(
      new view.MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
    await settle(handle);
    assertState(view.document, "combobox-selection", "Bravo");
    assertState(view.document, "combobox-open", "closed");
    assert(
      required<HTMLInputElement>(
        host,
        '[data-hydration-node="combobox-input"]',
      ).value === "Bravo",
      "Hydrated Combobox did not synchronize its input",
    );

    required<HTMLElement>(
      host,
      '[data-hydration-node="checkbox"]',
    ).click();
    required<HTMLElement>(host, '[data-hydration-node="switch"]').click();
    required<HTMLElement>(
      host,
      '[data-hydration-node="radio-bravo"]',
    ).click();

    const input = required<HTMLInputElement>(
      host,
      '[data-hydration-node="input"]',
    );
    input.value = "client input";
    input.dispatchEvent(new view.Event("input", { bubbles: true }));
    const select = required<HTMLSelectElement>(
      host,
      '[data-hydration-node="select"]',
    );
    select.value = "bravo";
    select.dispatchEvent(new view.Event("change", { bubbles: true }));
    const textarea = required<HTMLTextAreaElement>(
      host,
      '[data-hydration-node="textarea"]',
    );
    textarea.value = "client textarea";
    textarea.dispatchEvent(new view.Event("input", { bubbles: true }));
    await settle(handle);

    assertState(view.document, "checkbox", "true");
    assertState(view.document, "switch", "true");
    assertState(view.document, "radio", "Bravo");
    assertState(view.document, "input", "client input");
    assertState(view.document, "select", "bravo");
    assertState(view.document, "textarea", "client textarea");
    formData = new view.FormData(hydrationForm);
    assertFormValue(formData, "listbox-person", "Bravo");
    assertFormValue(formData, "combobox-person", "Bravo");
    assertFormValue(formData, "terms", "accepted");
    assertFormValue(formData, "notifications", "enabled");
    assertFormValue(formData, "delivery", "Bravo");
    assertFormValue(formData, "input", "client input");
    assertFormValue(formData, "select", "bravo");
    assertFormValue(formData, "textarea", "client textarea");
    assertIdReferencesResolve(view.document);

    handle.dispose();
    await settle();
    assert(
      !portalContent.isConnected,
      "Disposal left hydrated Portal content connected",
    );
    assert(
      view.document.querySelectorAll("#headlessui-portal-root").length === 0,
      "Disposal left the managed Portal root connected",
    );
    assert(
      view.document.querySelectorAll("[data-headlessui-focus-guard]").length ===
        0,
      "Disposal left FocusTrap guards connected",
    );
    const clientDiagnostics = handle.diagnosticDetails();
    assert(
      clientDiagnostics.length === 0,
      `Solid emitted hydration diagnostics: ${clientDiagnostics.join("\n")}`,
    );
    assert(
      consoleErrors.length === 0,
      `Hydration console diagnostics: ${consoleErrors.join("\n")}`,
    );
  } finally {
    dom?.window.close();
    await server.close();
  }
});
