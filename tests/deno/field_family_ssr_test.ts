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

function assertThrowsWithMessage(
  callback: () => unknown,
  expected: string,
): void {
  try {
    callback();
  } catch (error) {
    assert(error instanceof Error, "Expected an Error to be thrown");
    assertIncludes(error.message, expected);
    return;
  }

  throw new Error(`Expected callback to throw ${JSON.stringify(expected)}`);
}

interface FieldFamilySsrModule {
  renderCustomFieldset(): string;
  renderFieldFamily(): string;
  renderGeneratedField(): string;
  renderNestedFieldset(): string;
  renderOrphanDescription(): string;
  renderOrphanLabel(): string;
  renderPassiveLabel(): string;
}

Deno.test("Field family contexts and ARIA relationships render on the server", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/field-family-ssr-entry.tsx",
    ) as FieldFamilySsrModule;

    const field = module.renderFieldFamily();
    const controlId = field.match(/id="(headlessui-control-[^"]+)"/)?.[1];
    assert(controlId, `Expected a generated control id in ${field}`);
    assertIncludes(field, "field-disabled");
    assertIncludes(field, 'data-field-slot="disabled"');
    assertIncludes(field, "data-disabled");
    assertIncludes(field, 'aria-disabled="true"');
    assertIncludes(field, 'for="' + controlId + '"');
    assertIncludes(field, 'aria-labelledby="label-primary label-secondary"');
    assertIncludes(
      field,
      'aria-describedby="description-primary description-secondary"',
    );
    const fieldInput = field.match(/<input[^>]*>/)?.[0];
    assert(fieldInput, `Expected an input in ${field}`);
    assertIncludes(fieldInput, 'id="' + controlId + '"');
    assertIncludes(fieldInput, " disabled");
    assertExcludes(field, "htmlFor");

    const fieldset = module.renderNestedFieldset();
    assertIncludes(fieldset, "<fieldset");
    assertIncludes(fieldset, " disabled");
    assertIncludes(fieldset, 'aria-labelledby="fieldset-legend"');
    assert(
      /<div[^>]*id="fieldset-legend"/.test(fieldset),
      `Expected a div legend in ${fieldset}`,
    );
    assertIncludes(fieldset, 'aria-labelledby="field-label"');
    assertIncludes(fieldset, 'aria-describedby="field-description"');
    assertExcludes(fieldset, 'aria-labelledby="fieldset-legend field-label"');

    const nestedInput = fieldset.match(/<input[^>]*>/)?.[0];
    assert(nestedInput, `Expected an input in ${fieldset}`);
    assertExcludes(nestedInput, " disabled");

    const customFieldset = module.renderCustomFieldset();
    assertIncludes(customFieldset, "<section");
    assertIncludes(customFieldset, 'role="group"');
    assertIncludes(customFieldset, 'aria-disabled="true"');
    assertIncludes(customFieldset, 'aria-labelledby="custom-legend"');
    assertExcludes(customFieldset, " disabled");

    const passive = module.renderPassiveLabel();
    const passiveLabel = passive.match(/<label[^>]*id="passive-label"[^>]*>/)
      ?.[0];
    assert(passiveLabel, `Expected the passive label in ${passive}`);
    assertExcludes(passiveLabel, " for=");
    assertIncludes(passive, 'aria-labelledby="passive-label"');

    assert(
      module.renderGeneratedField() === module.renderGeneratedField(),
      "Expected Solid createUniqueId output to be deterministic across SSR roots",
    );

    assertThrowsWithMessage(
      module.renderOrphanLabel,
      "not inside a relevant parent",
    );
    assertThrowsWithMessage(
      module.renderOrphanDescription,
      "not inside a relevant parent",
    );
  } finally {
    await server.close();
  }
});
