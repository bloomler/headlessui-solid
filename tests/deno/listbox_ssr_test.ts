import { createServer } from "vite";
import solid from "vite-plugin-solid";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function includes(value: string, expected: string): void {
  assert(
    value.includes(expected),
    `Expected ${JSON.stringify(value)} to include ${JSON.stringify(expected)}`,
  );
}

function excludes(value: string, expected: string): void {
  assert(
    !value.includes(expected),
    `Expected ${JSON.stringify(value)} not to include ${
      JSON.stringify(expected)
    }`,
  );
}

function throwsMessage(callback: () => unknown, expected: string): void {
  try {
    callback();
  } catch (error) {
    assert(error instanceof Error, "Expected an Error");
    includes(error.message, expected);
    return;
  }
  throw new Error(`Expected callback to throw ${JSON.stringify(expected)}`);
}

function throwsContextNotFound(callback: () => unknown): void {
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

interface ListboxSsrModule {
  renderMultipleListbox(): string;
  renderOrphanButton(): string;
  renderOrphanLabel(): string;
  renderOrphanOption(): string;
  renderOrphanOptions(): string;
  renderPlaceholder(): string;
  renderSingleListbox(): string;
  staticsArePreserved(): boolean;
}

Deno.test("Listbox SSR preserves ARIA, forms, projection, and statics", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/listbox-ssr-entry.tsx",
    ) as ListboxSsrModule;

    assert(module.staticsArePreserved(), "Expected legacy statics to match");

    const single = module.renderSingleListbox();
    includes(single, 'id="people-label"');
    includes(single, 'id="people-button"');
    includes(single, 'aria-haspopup="listbox"');
    includes(single, 'aria-expanded="false"');
    includes(single, 'role="listbox"');
    includes(single, 'aria-orientation="vertical"');
    includes(single, 'id="bob-option"');
    includes(single, 'aria-selected="true"');
    includes(single, "Selected Bob");
    excludes(single, "Selected Alice");
    const disabled = single.match(/<div[^>]*id="carol-option"[^>]*>/)?.[0];
    assert(disabled, `Expected disabled option in ${single}`);
    includes(disabled, 'aria-disabled="true"');
    const fields = single.match(/<input[^>]*name="person\[[^"]+\]"[^>]*>/g) ??
      [];
    assert(fields.length === 2, `Expected object form fields in ${single}`);

    const multiple = module.renderMultipleListbox();
    includes(multiple, 'aria-multiselectable="true"');
    includes(multiple, 'name="person[0][id]"');
    includes(multiple, 'name="person[0][name]"');
    includes(multiple, "Selected Bob");

    includes(module.renderPlaceholder(), "Choose a person");
    throwsContextNotFound(module.renderOrphanButton);
    throwsMessage(
      module.renderOrphanLabel,
      "You used a <Label /> component, but it is not inside a relevant parent.",
    );
    throwsContextNotFound(module.renderOrphanOption);
    throwsContextNotFound(module.renderOrphanOptions);
  } finally {
    await server.close();
  }
});
