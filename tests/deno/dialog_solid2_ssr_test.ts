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
    assert(error instanceof Error, "Expected an Error instance");
    assertIncludes(error.message, expected);
    return;
  }
  throw new Error(`Expected an error containing ${JSON.stringify(expected)}`);
}

function assertContextNotFound(callback: () => unknown): void {
  try {
    callback();
  } catch (error) {
    assert(error instanceof Error, "Expected an Error instance");
    assert(
      error.constructor.name === "ContextNotFoundError",
      `Expected ContextNotFoundError, received ${String(error)}`,
    );
    return;
  }
  throw new Error("Expected callback to throw ContextNotFoundError");
}

interface DialogSsrModule {
  renderClosedPersistentDialog(): string;
  renderInheritedDialog(): string;
  renderInvalidClose(): string;
  renderInvalidOpen(): string;
  renderMissingClose(): string;
  renderMissingOpen(): string;
  renderMissingProps(): string;
  renderOpenDialog(): string;
  renderOrphanBackdrop(): string;
  renderOrphanPanel(): string;
  renderOrphanTitle(): string;
  renderSuppressedDialogStrategies(): {
    html: string;
    projectionCalls: number;
  };
}

Deno.test("Dialog family is portal-safe and validates its Solid 2 SSR contract", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/dialog-solid2-ssr-entry.tsx",
    ) as DialogSsrModule;

    const open = module.renderOpenDialog();
    assertIncludes(open, "<main");
    assertIncludes(open, "Open");
    assertExcludes(open, 'role="dialog"');
    assertExcludes(open, "SSR title");
    assertExcludes(open, "SSR description");

    const persistent = module.renderClosedPersistentDialog();
    assertExcludes(persistent, 'role="dialog"');
    assertExcludes(persistent, "Persistent dialog");

    const inherited = module.renderInheritedDialog();
    assertIncludes(inherited, "<section");
    assertExcludes(inherited, 'role="dialog"');
    assertExcludes(inherited, "Inherited dialog");

    const strategies = module.renderSuppressedDialogStrategies();
    assertIncludes(strategies.html, 'id="dialog-strategy-shell"');
    assertIncludes(strategies.html, 'id="before-dialogs"');
    assertIncludes(strategies.html, 'id="after-dialogs"');
    assertExcludes(strategies.html, 'role="dialog"');
    assertExcludes(strategies.html, "Open static projection");
    assertExcludes(strategies.html, "Open transition projection");
    assertExcludes(strategies.html, "Retained projection");
    assert(
      strategies.projectionCalls === 0,
      `Server invoked ${strategies.projectionCalls} portalled Dialog projections`,
    );
    assert(
      strategies.html.indexOf('id="before-dialogs"') <
        strategies.html.indexOf('id="after-dialogs"'),
      "Dialog portals disturbed the surrounding SSR order",
    );

    assertThrows(
      module.renderMissingProps,
      "provide an `open` and an `onClose` prop",
    );
    assertThrows(module.renderMissingOpen, "forgot an `open` prop");
    assertThrows(module.renderMissingClose, "forgot an `onClose` prop");
    assertThrows(module.renderInvalidOpen, "value is not a boolean");
    assertThrows(module.renderInvalidClose, "value is not a function");
    assertContextNotFound(module.renderOrphanPanel);
    assertContextNotFound(module.renderOrphanBackdrop);
    assertContextNotFound(module.renderOrphanTitle);
  } finally {
    await server.close();
  }
});
