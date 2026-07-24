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

interface FocusTrapSsrModule {
  readFocusTrapStatics(): Readonly<{
    all: number;
    autoFocus: number;
    sameEnum: boolean;
  }>;
  renderDefaultFocusTrap(): string;
  renderDisabledFocusTrap(): string;
  renderFocusTrapSlot(): string;
  renderPolymorphicFocusTrap(): string;
}

Deno.test("FocusTrap is server-safe and preserves its static API", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/focus-trap-solid2-ssr-entry.tsx",
    ) as FocusTrapSsrModule;

    const rendered = module.renderDefaultFocusTrap();
    assertIncludes(rendered, "<div");
    assertIncludes(rendered, 'id="server-trap"');
    assertIncludes(rendered, 'class="trap-class"');
    assertIncludes(rendered, 'id="server-action"');
    assertExcludes(rendered, "data-headlessui-focus-guard");
    assertExcludes(rendered, "initialFocus");
    assertExcludes(rendered, "features=");

    const disabled = module.renderDisabledFocusTrap();
    assertIncludes(disabled, "Unmanaged");
    assertExcludes(disabled, "data-headlessui-focus-guard");
    assertExcludes(disabled, "features=");

    const polymorphic = module.renderPolymorphicFocusTrap();
    assertIncludes(polymorphic, "<section");
    assertIncludes(polymorphic, 'data-purpose="polymorphic"');
    assertIncludes(polymorphic, "data-autofocus");
    for (
      const leaked of [
        "containers=",
        "features=",
        "initialFocus",
        "initialFocusFallback",
      ]
    ) {
      assertExcludes(polymorphic, leaked);
    }

    assertIncludes(module.renderFocusTrapSlot(), "Slot contents");
    assertIncludes(module.renderFocusTrapSlot(), 'data-slot="resolved"');

    const statics = module.readFocusTrapStatics();
    assert(statics.sameEnum, "FocusTrap.features must alias FocusTrapFeatures");
    assert(
      statics.all === 15,
      `Expected default feature mask 15, got ${statics.all}`,
    );
    assert(
      statics.autoFocus === 16,
      `Expected AutoFocus feature bit 16, got ${statics.autoFocus}`,
    );
  } finally {
    await server.close();
  }
});
