import { createServer } from "vite";
import solid from "vite-plugin-solid";

function assertIncludes(value: string, expected: string): void {
  if (!value.includes(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(value)} to include ${
        JSON.stringify(expected)
      }`,
    );
  }
}

function assertExcludes(value: string, expected: string): void {
  if (value.includes(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(value)} not to include ${
        JSON.stringify(expected)
      }`,
    );
  }
}

Deno.test("Portal has an explicit server-safe enabled/inline contract", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/portal-ssr-entry.tsx",
    ) as {
      renderDisabledPortal: () => string;
      renderEnabledPortal: () => string;
      renderPortalGroup: () => string;
    };

    const enabled = module.renderEnabledPortal();
    assertIncludes(enabled, 'id="server-parent"');
    assertIncludes(enabled, "Before");
    assertIncludes(enabled, "After");
    assertExcludes(enabled, "Portalled");
    assertExcludes(enabled, "headlessui-portal-root");

    const disabled = module.renderDisabledPortal();
    assertIncludes(disabled, "<section");
    assertIncludes(disabled, 'id="inline-portal"');
    assertIncludes(disabled, "Inline</section>");

    const group = module.renderPortalGroup();
    assertIncludes(group, 'id="group-sibling"');
    assertIncludes(group, "Sibling");
    assertExcludes(group, "Grouped portal");
  } finally {
    await server.close();
  }
});
