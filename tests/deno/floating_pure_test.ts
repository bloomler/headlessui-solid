import { createServer } from "vite";
import solid from "vite-plugin-solid";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

Deno.test("floating anchor normalization preserves the public forms", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const { resolveAnchor } = await server.ssrLoadModule(
      "/src/internal/floating.tsx",
    ) as {
      resolveAnchor(anchor: unknown): { to?: string } | null;
    };

    assert(resolveAnchor(false) === null, "false did not disable anchoring");
    assert(resolveAnchor(null) === null, "null did not disable anchoring");

    const shorthand = resolveAnchor("bottom start");
    assert(
      shorthand?.to === "bottom start",
      "string anchor was not normalized",
    );

    const configured = { to: "top end" as const, gap: 8, padding: "1rem" };
    assert(
      resolveAnchor(configured) === configured,
      "object anchor lost its stable identity",
    );
  } finally {
    await server.close();
  }
});

Deno.test("floating hooks require their Solid 2 provider contexts", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/floating-context-entry.ts",
    ) as {
      readOrphanFloatingPanel(): void;
      readOrphanFloatingReference(): void;
    };

    assertContextNotFound(module.readOrphanFloatingReference);
    assertContextNotFound(module.readOrphanFloatingPanel);
  } finally {
    await server.close();
  }
});
