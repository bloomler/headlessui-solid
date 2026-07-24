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

function findTag(value: string, marker: string): string {
  const tag = value.match(new RegExp(`<[^>]*${marker}[^>]*>`))?.[0];
  assert(tag, `Expected ${JSON.stringify(value)} to contain ${marker}`);
  return tag;
}

interface CheckboxSwitchSsrModule {
  renderCheckboxStates(): string;
  renderFieldCheckbox(): string;
  renderStaticAliases(): string;
  renderSwitchGroup(): string;
  renderSwitchStates(): string;
}

Deno.test("Checkbox and Switch preserve SSR state, form, and compound contracts", async () => {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    plugins: [solid({ ssr: true })],
    server: { middlewareMode: true },
  });

  try {
    const module = await server.ssrLoadModule(
      "/tests/deno/checkbox-switch-ssr-entry.tsx",
    ) as CheckboxSwitchSsrModule;

    const checkboxes = module.renderCheckboxStates();
    const checkedCheckbox = findTag(checkboxes, 'id="checked-checkbox"');
    assertIncludes(checkedCheckbox, 'role="checkbox"');
    assertIncludes(checkedCheckbox, 'aria-checked="true"');
    assertIncludes(checkedCheckbox, 'tabindex="0"');
    assertIncludes(checkedCheckbox, "autofocus");
    assertIncludes(checkedCheckbox, "data-checked");
    assertIncludes(checkedCheckbox, "data-autofocus");
    assertIncludes(checkedCheckbox, 'class="checked"');
    assertIncludes(checkboxes, "Accepted");
    assertIncludes(checkboxes, 'name="terms"');
    assertIncludes(checkboxes, 'value="accepted"');

    const mixedCheckbox = findTag(checkboxes, 'id="mixed-checkbox"');
    assertIncludes(mixedCheckbox, 'aria-checked="mixed"');
    assertIncludes(mixedCheckbox, 'aria-disabled="true"');
    assertIncludes(mixedCheckbox, 'indeterminate="true"');
    assertIncludes(mixedCheckbox, "data-indeterminate");
    assertIncludes(mixedCheckbox, "data-disabled");
    assertExcludes(mixedCheckbox, "tabindex=");

    const fieldCheckbox = module.renderFieldCheckbox();
    const inheritedCheckbox = findTag(fieldCheckbox, 'role="checkbox"');
    const inheritedId = inheritedCheckbox.match(/id="([^"]+)"/)?.[1];
    assert(inheritedId, `Expected a generated checkbox id in ${fieldCheckbox}`);
    assertIncludes(inheritedCheckbox, 'aria-labelledby="checkbox-label"');
    assertIncludes(
      inheritedCheckbox,
      'aria-describedby="checkbox-description"',
    );
    assertIncludes(inheritedCheckbox, 'aria-disabled="true"');
    assertIncludes(fieldCheckbox, `for="${inheritedId}"`);

    const switches = module.renderSwitchStates();
    const enabledSwitch = findTag(switches, 'id="enabled-switch"');
    assertIncludes(enabledSwitch, "<button");
    assertIncludes(enabledSwitch, 'role="switch"');
    assertIncludes(enabledSwitch, 'type="button"');
    assertIncludes(enabledSwitch, 'aria-checked="true"');
    assertIncludes(enabledSwitch, 'tabindex="0"');
    assertIncludes(enabledSwitch, "data-checked");
    assertIncludes(enabledSwitch, "data-autofocus");
    assertIncludes(enabledSwitch, 'class="enabled"');
    assertIncludes(switches, "On");
    assertIncludes(switches, 'name="notifications"');
    assertIncludes(switches, 'value="enabled"');

    const spanSwitch = findTag(switches, 'id="span-switch"');
    assertIncludes(spanSwitch, "<span");
    assertIncludes(spanSwitch, 'role="switch"');
    assertIncludes(spanSwitch, 'aria-checked="false"');
    assertIncludes(spanSwitch, "disabled");
    assertExcludes(spanSwitch, 'type="button"');

    const group = module.renderSwitchGroup();
    assertIncludes(group, 'id="switch-label"');
    assertIncludes(group, 'id="switch-description"');
    const groupedSwitch = findTag(group, 'id="group-switch"');
    assertIncludes(groupedSwitch, 'aria-labelledby="switch-label"');
    assertIncludes(
      groupedSwitch,
      'aria-describedby="switch-description"',
    );

    const aliases = module.renderStaticAliases();
    const staticSwitch = findTag(aliases, 'id="static-switch"');
    assertIncludes(staticSwitch, 'aria-labelledby="static-label"');
    assertIncludes(staticSwitch, 'aria-describedby="static-description"');
  } finally {
    await server.close();
  }
});
