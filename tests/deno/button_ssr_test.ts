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

Deno.test("Button TSX compiles and renders through Solid's server runtime", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/button-ssr-entry.tsx",
    ) as {
      renderAnchorButton: () => string;
      renderDefaultButton: () => string;
      renderDisabledButton: () => string;
    };

    const defaultButton = module.renderDefaultButton();
    assertIncludes(defaultButton, "<button");
    assertIncludes(defaultButton, 'type="button"');
    assertIncludes(defaultButton, "Ready");
    assertExcludes(defaultButton, "Unavailable");

    const disabledButton = module.renderDisabledButton();
    assertIncludes(disabledButton, "disabled");
    assertIncludes(disabledButton, "autofocus");
    assertIncludes(disabledButton, "data-disabled");
    assertIncludes(disabledButton, "data-autofocus");

    const anchorButton = module.renderAnchorButton();
    assertIncludes(anchorButton, "<a");
    assertIncludes(anchorButton, 'href="/account"');
    assertExcludes(anchorButton, 'type="button"');
  } finally {
    await server.close();
  }
});
