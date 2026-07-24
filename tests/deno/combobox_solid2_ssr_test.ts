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

function assertThrows(callback: () => unknown, expected: string): void {
  try {
    callback();
  } catch (error) {
    assert(error instanceof Error, "Expected an Error");
    assertIncludes(error.message, expected);
    return;
  }
  throw new Error(`Expected callback to throw ${JSON.stringify(expected)}`);
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

interface ComboboxSsrModule {
  renderClosedCombobox(): string;
  renderMultipleForm(): string;
  renderOpenCombobox(): string;
  renderOrphanButton(): string;
  renderOrphanInput(): string;
  renderOrphanLabel(): string;
  renderOrphanOption(): string;
  renderOrphanOptions(): string;
  renderRetainedCombobox(): string;
}

Deno.test("Combobox family preserves Solid 2 SSR, ARIA, and form contracts", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });
  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/combobox-solid2-ssr-entry.tsx",
    ) as ComboboxSsrModule;

    const closed = module.renderClosedCombobox();
    assertIncludes(closed, 'role="combobox"');
    assertIncludes(closed, 'aria-autocomplete="list"');
    assertIncludes(closed, 'aria-expanded="false"');
    assertIncludes(closed, "Person");
    assertExcludes(closed, 'role="listbox"');

    const open = module.renderOpenCombobox();
    assertIncludes(open, 'data-open="yes"');
    assertIncludes(open, 'role="combobox"');
    assertIncludes(open, 'aria-expanded="true"');
    assertIncludes(open, 'role="listbox"');
    assertIncludes(open, 'role="option"');
    assertIncludes(open, 'aria-selected="true"');
    assertIncludes(open, 'aria-disabled="true"');
    assertIncludes(open, "Bravo");

    const form = module.renderMultipleForm();
    assertIncludes(form, 'name="people[0][id]"');
    assertIncludes(form, 'name="people[1][name]"');

    const retained = module.renderRetainedCombobox();
    assertIncludes(retained, "Retained");
    assertIncludes(retained, "hidden");
    assertIncludes(retained, "display:none");

    assertContextNotFound(module.renderOrphanInput);
    assertThrows(
      module.renderOrphanLabel,
      "You used a <Label /> component, but it is not inside a relevant parent.",
    );
    assertContextNotFound(module.renderOrphanButton);
    assertContextNotFound(module.renderOrphanOptions);
    assertContextNotFound(module.renderOrphanOption);
  } finally {
    await server.close();
  }
});
