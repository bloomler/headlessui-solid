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

function openingTag(value: string, text: string): string {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = value.match(new RegExp(`<[^>]+>(?=${escaped})`));
  assert(
    match,
    `Expected an opening tag before ${JSON.stringify(text)} in ${value}`,
  );
  return match[0];
}

function assertThrows(callback: () => unknown): void {
  try {
    callback();
  } catch (error) {
    assert(error instanceof Error, "Expected an Error instance");
    return;
  }

  throw new Error("Expected a missing Disclosure context to throw");
}

interface DisclosureSsrModule {
  renderClosedDisclosure(): string;
  renderDisabledDisclosure(): string;
  renderGeneratedDisclosure(): string;
  renderNestedButton(): string;
  renderOpenDisclosure(): string;
  renderOrphanButton(): string;
  renderOrphanPanel(): string;
  renderPersistentDisclosure(): string;
  renderPolymorphicDisclosure(): string;
  renderStaticDisclosure(): string;
}

Deno.test("Disclosure family preserves Solid 2 SSR and ARIA contracts", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/disclosure-solid2-ssr-entry.tsx",
    ) as DisclosureSsrModule;

    const closed = module.renderClosedDisclosure();
    assertIncludes(closed, 'data-root-state="closed"');
    assertIncludes(closed, 'id="account-trigger"');
    assertIncludes(closed, 'type="button"');
    assertIncludes(closed, 'aria-expanded="false"');
    assertIncludes(closed, "Show account");
    assertExcludes(closed, "account-panel");
    assertExcludes(closed, "aria-controls");

    const open = module.renderOpenDisclosure();
    assertIncludes(open, 'id="open-trigger"');
    assertIncludes(open, 'aria-expanded="true"');
    assertIncludes(open, "data-open");
    assertIncludes(open, 'id="open-panel"');
    assertIncludes(open, "Open contents");

    const staticPanel = openingTag(
      module.renderStaticDisclosure(),
      "Static contents",
    );
    assertIncludes(staticPanel, 'id="static-panel"');
    assertExcludes(staticPanel, " hidden");
    assertExcludes(staticPanel, "display:none");
    assertExcludes(staticPanel, " static");

    const persistent = module.renderPersistentDisclosure();
    const persistentPanel = openingTag(persistent, "Persistent contents");
    assertIncludes(persistentPanel, 'id="persistent-panel"');
    assertIncludes(persistentPanel, " hidden");
    assertIncludes(persistentPanel, "display:none");
    assertExcludes(persistentPanel, "unmount");

    const nested = module.renderNestedButton();
    const primaryButton = openingTag(nested, "Open");
    const nestedButton = openingTag(nested, "Close");
    assertIncludes(primaryButton, 'id="primary-trigger"');
    assertIncludes(primaryButton, 'aria-expanded="true"');
    assertExcludes(nestedButton, "id=");
    assertExcludes(nestedButton, "aria-expanded");
    assertExcludes(nestedButton, "aria-controls");
    assertIncludes(nestedButton, 'type="button"');
    assertExcludes(nested, "ignored-nested-id");

    const polymorphic = module.renderPolymorphicDisclosure();
    const section = polymorphic.match(/<section[^>]*>/)?.[0];
    assert(section, `Expected a section in ${polymorphic}`);
    assertIncludes(section, "expanded");
    assertIncludes(section, "data-open");
    const customButton = openingTag(polymorphic, "Custom trigger");
    assert(
      customButton.startsWith("<div"),
      `Expected a div in ${customButton}`,
    );
    assertIncludes(customButton, 'role="button"');
    assertIncludes(customButton, "autofocus");
    assertExcludes(customButton, "type=");
    assertIncludes(polymorphic, "<article");
    assertExcludes(polymorphic, "transition");

    const disabled = module.renderDisabledDisclosure();
    const disabledButton = openingTag(disabled, "Unavailable");
    assertIncludes(disabledButton, " disabled");
    assertIncludes(disabledButton, " autofocus");
    assertIncludes(disabledButton, "data-disabled");
    assertIncludes(disabledButton, "data-autofocus");

    const generated = module.renderGeneratedDisclosure();
    assertIncludes(generated, 'id="headlessui-disclosure-button-');
    assertIncludes(generated, 'id="headlessui-disclosure-panel-');
    assert(
      generated === module.renderGeneratedDisclosure(),
      "Expected deterministic createUniqueId output across SSR roots",
    );

    assertThrows(module.renderOrphanButton);
    assertThrows(module.renderOrphanPanel);
  } finally {
    await server.close();
  }
});
