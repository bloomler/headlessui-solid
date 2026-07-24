import { createServer } from "vite";
import solid from "vite-plugin-solid";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIncludes(value: string, expected: string): void {
  assert(
    value.includes(expected),
    `Expected ${JSON.stringify(value)} to include ${JSON.stringify(expected)}`,
  );
}

function assertExcludes(value: string, expected: string): void {
  assert(
    !value.includes(expected),
    `Expected ${JSON.stringify(value)} not to include ${
      JSON.stringify(expected)
    }`,
  );
}

function assertContextNotFound(callback: () => unknown): void {
  try {
    callback();
  } catch (error) {
    assert(error instanceof Error, "Expected an Error");
    assert(
      error.constructor.name === "ContextNotFoundError",
      `Expected ContextNotFoundError, received ${String(error)}`,
    );
    return;
  }
  throw new Error("Expected callback to throw ContextNotFoundError");
}

interface TabsSsrModule {
  renderControlledTabs(): string;
  renderDefaultTabs(): string;
  renderIndexedTabs(): string;
  renderOrphanList(): string;
  renderOrphanPanel(): string;
  renderOrphanPanels(): string;
  renderOrphanTab(): string;
  renderPanelsFirst(): string;
  renderStrategies(): string;
  staticsArePreserved(): boolean;
}

Deno.test("Tabs SSR preserves indices, structure, strategies, and statics", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/tabs-ssr-entry.tsx",
    ) as TabsSsrModule;

    assert(
      module.staticsArePreserved(),
      "Expected deprecated statics to match",
    );

    const defaultTabs = module.renderDefaultTabs();
    assert(
      defaultTabs === module.renderDefaultTabs(),
      "Expected generated IDs and stable indices to repeat across SSR roots",
    );
    assertIncludes(defaultTabs, 'role="tablist"');
    assertIncludes(defaultTabs, 'aria-orientation="horizontal"');
    assertIncludes(defaultTabs, "data-selected-index>0</output>");
    assertIncludes(defaultTabs, "data-list-index>0</output>");
    const profileTab = defaultTabs.match(
      /<button[^>]*id="profile-tab"[^>]*>/,
    )?.[0];
    const securityTab = defaultTabs.match(
      /<button[^>]*id="security-tab"[^>]*>/,
    )?.[0];
    assert(profileTab, `Expected profile tab in ${defaultTabs}`);
    assert(securityTab, `Expected security tab in ${defaultTabs}`);
    assertIncludes(profileTab, 'aria-selected="true"');
    assertIncludes(profileTab, 'tabindex="0"');
    assertIncludes(profileTab, "data-selected");
    assertIncludes(securityTab, 'aria-selected="false"');
    assertIncludes(securityTab, 'tabindex="-1"');
    assertIncludes(defaultTabs, "Profile content");
    assertExcludes(defaultTabs, "Security content");
    assertExcludes(defaultTabs, "Billing content");
    const hiddenSecurity = defaultTabs.match(
      /<span[^>]*id="security-panel"[^>]*>/,
    )?.[0];
    assert(
      hiddenSecurity,
      `Expected hidden security placeholder in ${defaultTabs}`,
    );
    assertIncludes(hiddenSecurity, 'role="tabpanel"');
    assertIncludes(hiddenSecurity, 'aria-hidden="true"');
    assertIncludes(hiddenSecurity, 'tabindex="-1"');

    const indexed = module.renderIndexedTabs();
    assertIncludes(indexed, 'aria-orientation="vertical"');
    assertIncludes(indexed, "data-selected-index>1</output>");
    assertIncludes(indexed, "Security content");
    assertExcludes(indexed, "Profile content");
    assertExcludes(indexed, "Billing content");

    const controlled = module.renderControlledTabs();
    assertIncludes(controlled, "data-selected-index>2</output>");
    assertIncludes(controlled, "Billing content");
    assertExcludes(controlled, "Profile content");
    assertExcludes(controlled, "Security content");

    const panelsFirst = module.renderPanelsFirst();
    assertIncludes(panelsFirst, "Second panel-first content");
    assertExcludes(panelsFirst, "First panel-first content");

    const strategies = module.renderStrategies();
    assertIncludes(strategies, "Selected content");
    assertIncludes(strategies, "Persistent content");
    assertIncludes(strategies, "Static content");
    const persistent = strategies.match(
      /<div[^>]*id="persistent-panel"[^>]*>/,
    )?.[0];
    const staticPanel = strategies.match(
      /<div[^>]*id="static-panel"[^>]*>/,
    )?.[0];
    assert(persistent, `Expected persistent panel in ${strategies}`);
    assert(staticPanel, `Expected static panel in ${strategies}`);
    assertIncludes(persistent, " hidden");
    assertIncludes(persistent, "display:none");
    assertExcludes(staticPanel, " hidden");
    assertExcludes(staticPanel, "display:none");

    assertContextNotFound(module.renderOrphanList);
    assertContextNotFound(module.renderOrphanTab);
    assertContextNotFound(module.renderOrphanPanels);
    assertContextNotFound(module.renderOrphanPanel);
  } finally {
    await server.close();
  }
});
