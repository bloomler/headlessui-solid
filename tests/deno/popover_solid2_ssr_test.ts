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

interface PopoverSsrModule {
  renderClosedPopover(): string;
  renderOpenPopover(): string;
  renderOrphanBackdrop(): string;
  renderOrphanButton(): string;
  renderOrphanOverlay(): string;
  renderOrphanPanel(): string;
  renderRetainedPopover(): string;
  renderStaticPopover(): string;
  staticsArePreserved(): boolean;
}

Deno.test("Popover family preserves Solid 2 SSR, statics, and render strategies", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/popover-solid2-ssr-entry.tsx",
    ) as PopoverSsrModule;

    assert(module.staticsArePreserved(), "Expected legacy statics to match");

    const closed = module.renderClosedPopover();
    includes(closed, 'id="account-popover"');
    includes(closed, 'id="account-button"');
    includes(closed, 'aria-expanded="false"');
    excludes(closed, "account-backdrop");
    excludes(closed, "account-panel");

    const open = module.renderOpenPopover();
    includes(open, 'id="navigation-group"');
    includes(open, 'id="navigation-popover"');
    includes(open, 'id="navigation-button"');
    includes(open, 'aria-expanded="true"');
    includes(open, "Open navigation");
    includes(open, 'id="navigation-backdrop"');
    includes(open, 'aria-hidden="true"');
    includes(open, 'id="navigation-panel"');
    includes(open, 'tabindex="-1"');
    includes(open, "Documentation");

    const retained = module.renderRetainedPopover();
    includes(retained, "Retained backdrop");
    includes(retained, "Retained panel");
    includes(retained, "hidden");
    includes(retained, "display:none");

    const staticallyRendered = module.renderStaticPopover();
    includes(staticallyRendered, 'id="static-overlay"');
    includes(staticallyRendered, 'id="static-panel"');
    includes(staticallyRendered, "Static panel");

    throwsContextNotFound(module.renderOrphanButton);
    throwsContextNotFound(module.renderOrphanBackdrop);
    throwsContextNotFound(module.renderOrphanOverlay);
    throwsContextNotFound(module.renderOrphanPanel);
  } finally {
    await server.close();
  }
});
