import { createServer } from "vite";
import solid from "vite-plugin-solid";

Deno.test("CloseButton is server-safe outside a close provider", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/close-button-ssr-entry.tsx",
    ) as { renderCloseButton(): string };
    const output = module.renderCloseButton();

    if (!/<button[^>]*id="close"/.test(output)) {
      throw new Error(`Expected a close button in ${output}`);
    }
    for (
      const expected of ['class="trigger"', 'type="button"', ">Close</button>"]
    ) {
      if (!output.includes(expected)) {
        throw new Error(`Expected ${output} to include ${expected}`);
      }
    }
  } finally {
    await server.close();
  }
});
