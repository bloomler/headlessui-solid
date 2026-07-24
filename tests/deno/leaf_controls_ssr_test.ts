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

function findControl(value: string, name: string): string {
  const controls = value.match(/<(?:input|select|textarea)\b[^>]*>/g) ?? [];
  const control = controls.find((candidate) =>
    candidate.includes(`name="${name}"`)
  );
  if (!control) {
    throw new Error(
      `Expected ${JSON.stringify(value)} to contain control ${
        JSON.stringify(name)
      }`,
    );
  }
  return control;
}

Deno.test("Solid leaf controls compile and preserve SSR state/ARIA contracts", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/leaf_controls-ssr-entry.tsx",
    ) as {
      renderDataInteractiveLink: () => string;
      renderDirectAriaControls: () => string;
      renderExplicitFieldOverrides: () => string;
      renderGeneratedIds: () => string;
      renderInheritedFieldControls: () => string;
      renderInvalidControls: () => string;
    };

    const interactive = module.renderDataInteractiveLink();
    assertIncludes(interactive, "<a");
    assertIncludes(interactive, 'href="/profile"');
    assertIncludes(interactive, "idle");
    assertExcludes(interactive, "data-hover");
    assertExcludes(interactive, "data-focus");
    assertExcludes(interactive, "data-active");
    assertExcludes(interactive, "<span");

    const controls = module.renderInvalidControls();
    for (const id of ["email", "country", "bio"]) {
      assertIncludes(controls, `id="${id}"`);
    }
    assertIncludes(controls, 'aria-labelledby="email-label"');
    assertIncludes(controls, 'aria-describedby="email-help"');
    assertIncludes(controls, 'aria-labelledby="country-label"');
    assertIncludes(controls, 'aria-describedby="bio-help"');
    assertIncludes(controls, 'aria-invalid="true"');
    assertIncludes(controls, "data-disabled");
    assertIncludes(controls, "data-invalid");
    assertIncludes(controls, "data-autofocus");
    assertIncludes(controls, "<option");
    assertIncludes(controls, "Israel");
    assertIncludes(controls, "Hello");

    const directAria = module.renderDirectAriaControls();
    assertIncludes(directAria, 'aria-labelledby="direct-input-label"');
    assertIncludes(directAria, 'aria-describedby="direct-input-help"');
    assertIncludes(directAria, 'aria-invalid="grammar"');
    assertIncludes(directAria, 'aria-invalid="spelling"');

    const generatedIds = module.renderGeneratedIds();
    assertIncludes(generatedIds, 'id="headlessui-input-');
    assertIncludes(generatedIds, 'id="headlessui-select-');
    assertIncludes(generatedIds, 'id="headlessui-textarea-');

    const inherited = module.renderInheritedFieldControls();
    for (const kind of ["input", "select", "textarea"]) {
      const control = findControl(inherited, `inherited-${kind}`);
      assertIncludes(control, 'id="headlessui-control-');
      assertIncludes(control, " disabled");
      assertIncludes(control, "data-disabled");
      assertIncludes(control, `aria-labelledby="inherited-${kind}-label"`);
      assertIncludes(
        control,
        `aria-describedby="inherited-${kind}-description"`,
      );
    }

    const explicit = module.renderExplicitFieldOverrides();
    for (const kind of ["input", "select", "textarea"]) {
      const control = findControl(explicit, `explicit-${kind}`);
      assertIncludes(control, `id="explicit-${kind}"`);
      assertIncludes(control, `aria-labelledby="direct-${kind}-label"`);
      assertIncludes(
        control,
        `aria-describedby="direct-${kind}-description"`,
      );
      assertExcludes(control, " disabled");
      assertExcludes(control, "data-disabled");
      assertExcludes(control, `aria-labelledby="context-${kind}-label"`);
      assertExcludes(
        control,
        `aria-describedby="context-${kind}-description"`,
      );
    }
  } finally {
    await server.close();
  }
});
