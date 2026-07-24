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

interface MenuSsrModule {
  renderClosedMenu(): string;
  renderOpenMenu(): string;
  renderOrphanButton(): string;
  renderOrphanItem(): string;
  renderOrphanItems(): string;
  renderRetainedMenu(): string;
}

Deno.test("Menu family preserves Solid 2 SSR and ARIA contracts", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/menu-solid2-ssr-entry.tsx",
    ) as MenuSsrModule;

    const closed = module.renderClosedMenu();
    assertIncludes(closed, "account-button");
    assertIncludes(closed, 'aria-haspopup="menu"');
    assertIncludes(closed, 'aria-expanded="false"');
    assertExcludes(closed, "account-items");

    const open = module.renderOpenMenu();
    assertIncludes(open, 'aria-expanded="true"');
    assertIncludes(open, 'id="open-items"');
    assertIncludes(open, 'role="menu"');
    assertIncludes(open, 'role="group"');
    assertIncludes(open, 'aria-labelledby="file-heading"');
    assertIncludes(open, 'role="presentation"');
    assertIncludes(open, 'role="separator"');
    assertIncludes(open, 'role="menuitem"');
    assertIncludes(open, 'aria-disabled="true"');
    assertIncludes(open, "<div");

    const retained = module.renderRetainedMenu();
    assertIncludes(retained, "Retained");
    assertIncludes(retained, "hidden");
    assertIncludes(retained, "display:none");

    assertContextNotFound(module.renderOrphanButton);
    assertContextNotFound(module.renderOrphanItems);
    assertContextNotFound(module.renderOrphanItem);
  } finally {
    await server.close();
  }
});
