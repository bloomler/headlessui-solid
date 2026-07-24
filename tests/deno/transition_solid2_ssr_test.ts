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

interface TransitionSsrModule {
  renderAppearingTransition(): string;
  renderAutoRootChild(): string;
  renderInheritedOpenClosed(): string;
  renderMissingShow(): string;
  renderNestedStatics(): string;
  renderOrphanChild(): string;
  renderRetainedTransition(): string;
  renderTransparentBoundary(): string;
  renderUnmountedTransition(): string;
  renderVisibleTransition(): string;
}

Deno.test("Transition family preserves Solid 2 SSR and context contracts", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/transition-solid2-ssr-entry.tsx",
    ) as TransitionSsrModule;

    const visible = module.renderVisibleTransition();
    assertIncludes(visible, "<div");
    assertIncludes(visible, 'class="base entered"');
    assertIncludes(visible, "Visible");
    for (
      const leaked of [
        "enter-from",
        "enter-to",
        'enter="',
        'leave="',
        "data-enter",
        "data-transition",
      ]
    ) {
      assertExcludes(visible, leaked);
    }

    const appearing = module.renderAppearingTransition();
    assertIncludes(appearing, "<section");
    assertIncludes(appearing, 'class="base enter enter-from"');
    assertExcludes(appearing, "data-enter");
    assertExcludes(appearing, "data-closed");

    assertExcludes(module.renderUnmountedTransition(), "Hidden");
    const retained = module.renderRetainedTransition();
    assertIncludes(retained, "<aside");
    assertIncludes(retained, "hidden");
    assertIncludes(retained, "display:none");
    assertIncludes(retained, "Retained");

    const nested = module.renderNestedStatics();
    assertIncludes(nested, "<main");
    assertIncludes(nested, 'id="root-transition"');
    assertIncludes(nested, "<section");
    assertIncludes(nested, 'id="first-child"');
    assertIncludes(nested, "<article");
    assertIncludes(nested, 'id="second-child"');

    const inherited = module.renderInheritedOpenClosed();
    assertIncludes(inherited, "<nav");
    assertIncludes(inherited, "Inherited");
    const autoRoot = module.renderAutoRootChild();
    assertIncludes(autoRoot, "<aside");
    assertIncludes(autoRoot, "Automatic root");

    const transparent = module.renderTransparentBoundary();
    assertIncludes(transparent, 'id="transparent-child"');
    assertExcludes(transparent, "<div");

    assertThrows(
      module.renderMissingShow,
      "missing a `show={true | false}` prop",
    );
    assertThrows(module.renderOrphanChild, "missing a parent <Transition />");
  } finally {
    await server.close();
  }
});
