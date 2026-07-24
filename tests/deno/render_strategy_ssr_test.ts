import { createServer } from "vite";
import solid from "vite-plugin-solid";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface FixtureModule {
  renderChildKinds(): {
    accessorArgumentCounts: number[];
    html: string;
    slotLabel: string | undefined;
  };
  renderRetainedContent(): string;
  renderStaticContent(): string;
  renderUnmountedContent(): string;
}

Deno.test("static rendering overrides the hidden render strategy", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const fixture = await server.ssrLoadModule(
      "/tests/deno/render-strategy-ssr-entry.tsx",
    ) as FixtureModule;

    const staticContent = fixture.renderStaticContent();
    assert(staticContent.includes("static-content"), "Static content vanished");
    assert(!staticContent.includes("hidden"), "Static content was hidden");
    assert(
      !staticContent.includes("display:none"),
      "Static content received display:none",
    );

    const retainedContent = fixture.renderRetainedContent();
    assert(
      retainedContent.includes("retained-content"),
      "Retained content vanished",
    );
    assert(
      retainedContent.includes("hidden"),
      "Retained content was not hidden",
    );
    assert(
      retainedContent.includes("display:none"),
      "Retained content did not receive display:none",
    );

    assert(
      !fixture.renderUnmountedContent().includes("unmounted-content"),
      "Unmounted content remained in the output",
    );

    const childKinds = fixture.renderChildKinds();
    assert(
      childKinds.accessorArgumentCounts.join(",") === "0",
      `Zero-arity SSR accessor received arguments: ${childKinds.accessorArgumentCounts}`,
    );
    assert(
      childKinds.slotLabel === "slot-value",
      `Render callback received the wrong slot: ${childKinds.slotLabel}`,
    );
    assert(
      childKinds.html.includes('id="ssr-accessor-child"'),
      "SSR accessor child vanished",
    );
    assert(
      childKinds.html.includes('id="ssr-slot-child"'),
      "SSR slot child vanished",
    );
    assert(
      childKinds.html.includes("slot-value"),
      "SSR slot output was not rendered",
    );
  } finally {
    await server.close();
  }
});
