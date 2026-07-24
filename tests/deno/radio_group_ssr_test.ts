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

interface RadioGroupSsrModule {
  renderDisabledFormGroup(): string;
  renderFieldRadios(): string;
  renderLegacyGroup(): string;
  renderObjectGroup(): string;
  renderOrphanOption(): string;
  renderOrphanRadio(): string;
  renderSelectedGroup(): string;
  staticsArePreserved(): boolean;
}

Deno.test("RadioGroup SSR preserves ARIA, selection, fields, and statics", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/radio-group-ssr-entry.tsx",
    ) as RadioGroupSsrModule;

    assert(module.staticsArePreserved(), "Expected legacy statics to match");

    const selected = module.renderSelectedGroup();
    assertIncludes(selected, 'role="radiogroup"');
    assertIncludes(selected, 'aria-labelledby="fulfilment-label"');
    assertIncludes(selected, 'aria-describedby="fulfilment-description"');
    assertIncludes(selected, 'name="fulfilment"');
    assertIncludes(selected, 'value="delivery"');
    assertIncludes(selected, 'form="checkout"');
    assertIncludes(selected, " checked");
    const pickup = selected.match(/<span[^>]*id="pickup-radio"[^>]*>/)?.[0];
    const delivery = selected.match(/<span[^>]*id="delivery-radio"[^>]*>/)
      ?.[0];
    assert(pickup, `Expected pickup radio in ${selected}`);
    assert(delivery, `Expected delivery radio in ${selected}`);
    assertIncludes(pickup, 'aria-checked="false"');
    assertIncludes(pickup, 'tabindex="-1"');
    assertIncludes(delivery, 'aria-checked="true"');
    assertIncludes(delivery, 'tabindex="0"');
    assertIncludes(delivery, "data-checked");

    const legacy = module.renderLegacyGroup();
    assertIncludes(legacy, 'role="radio"');
    assertIncludes(legacy, 'aria-labelledby="alpha-label"');
    assertIncludes(legacy, 'aria-describedby="alpha-description"');
    assertIncludes(legacy, "idle");
    assertIncludes(legacy, "Beta");

    const objectGroup = module.renderObjectGroup();
    assertIncludes(objectGroup, 'name="person[id]"');
    assertIncludes(objectGroup, 'value="2"');
    assertIncludes(objectGroup, 'name="person[name]"');
    assertIncludes(objectGroup, 'value="Current Bob"');
    const objectRadios = objectGroup.match(/<span[^>]*role="radio"[^>]*>/g) ??
      [];
    assert(objectRadios.length === 2, `Expected two radios in ${objectGroup}`);
    assertIncludes(objectRadios[1], 'aria-checked="true"');

    const fields = module.renderFieldRadios();
    const fieldRadio = fields.match(
      /<span[^>]*aria-labelledby="field-radio-label"[^>]*>/,
    )?.[0];
    const explicitRadio = fields.match(
      /<span[^>]*id="explicit-radio"[^>]*>/,
    )?.[0];
    assert(fieldRadio, `Expected inherited Field radio in ${fields}`);
    assert(explicitRadio, `Expected explicit Field radio in ${fields}`);
    assertIncludes(fieldRadio, 'id="headlessui-control-');
    assertIncludes(fieldRadio, 'aria-describedby="field-radio-description"');
    assertIncludes(fieldRadio, 'aria-disabled="true"');
    assertIncludes(explicitRadio, 'aria-labelledby="explicit-radio-label"');
    assertIncludes(
      explicitRadio,
      'aria-describedby="explicit-radio-description"',
    );
    assertExcludes(explicitRadio, "aria-disabled");

    const disabled = module.renderDisabledFormGroup();
    const hiddenField = disabled.match(/<input[^>]*name="delivery"[^>]*>/)
      ?.[0];
    assert(hiddenField, `Expected hidden field in ${disabled}`);
    assertIncludes(hiddenField, " disabled");

    assertContextNotFound(module.renderOrphanRadio);
    assertContextNotFound(module.renderOrphanOption);
  } finally {
    await server.close();
  }
});
