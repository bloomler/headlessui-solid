import { render } from "@solidjs/web";
import {
  createSignal,
  DEV,
  type Element as SolidElement,
  flush,
  merge,
} from "solid-js";
import { afterEach, describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  DataInteractive,
  Description,
  Field,
  Fieldset,
  Input,
  Label,
  Legend,
} from "../src/index.ts";
import { useDescriptions } from "../src/components/description/description.tsx";
import { useLabels } from "../src/components/label/label.tsx";

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  dispose?.();
  host?.remove();
  dispose = undefined;
  host = undefined;
});

function mount(children: () => SolidElement): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  dispose = render(children, host);
  flush();
  return host;
}

function parityTest(
  name: string,
  run: () => Promise<void> | void,
): void {
  test(name, async () => {
    const diagnostics = DEV?.diagnostics.capture();
    try {
      await run();
    } finally {
      expect(diagnostics?.stop() ?? []).toEqual([]);
    }
  });
}

function required<T extends globalThis.Element>(
  value: T | null | undefined,
  message: string,
): T {
  if (!value) throw new Error(message);
  return value;
}

function idRefs(element: globalThis.Element, attribute: string): string[] {
  return element.getAttribute(attribute)?.split(/\s+/).filter(Boolean) ?? [];
}

function DescriptionHarness(props: { children?: SolidElement }): SolidElement {
  const [describedBy, DescriptionProvider] = useDescriptions();
  return (
    <DescriptionProvider>
      <div data-description-owner aria-describedby={describedBy()}>
        {props.children}
      </div>
    </DescriptionProvider>
  );
}

function LabelHarness(props: { children?: SolidElement }): SolidElement {
  const [labelledBy, LabelProvider] = useLabels();
  return (
    <LabelProvider>
      <div data-label-owner aria-labelledby={labelledBy()}>
        {props.children}
      </div>
    </LabelProvider>
  );
}

describe("DataInteractive parity", () => {
  parityTest(
    "accepts a memo-backed spread without untracked shape diagnostics",
    () => {
      function InteractiveLink(props: { expanded: boolean }) {
        const forwarded = merge(() => ({
          href: props.expanded ? "#expanded" : "#collapsed",
        }));

        return (
          <DataInteractive as="a" {...forwarded}>
            Toggle target
          </DataInteractive>
        );
      }

      const [expanded, setExpanded] = createSignal(false);
      mount(() => <InteractiveLink expanded={expanded()} />);
      const link = required(
        host?.querySelector<HTMLAnchorElement>("a"),
        "Expected forwarded DataInteractive link",
      );
      expect(link.getAttribute("href")).toBe("#collapsed");
      setExpanded(true);
      flush();
      expect(link.getAttribute("href")).toBe("#expanded");
    },
  );

  parityTest("exposes focus state on its explicit Solid target", async () => {
    mount(() => <DataInteractive as="a" href="#alice">Alice</DataInteractive>);
    const link = required(
      host?.querySelector<HTMLAnchorElement>("a"),
      "Expected DataInteractive link",
    );
    expect(link.hasAttribute("data-focus")).toBe(false);
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard("{Tab}");
    flush();
    expect(document.activeElement).toBe(link);
    expect(link.hasAttribute("data-focus")).toBe(true);
  });

  parityTest(
    "exposes hover state without changing element semantics",
    async () => {
      mount(() => (
        <DataInteractive as="a" href="#alice">
          Alice
        </DataInteractive>
      ));
      const link = page.getByRole("link", { name: "Alice" });
      await expect.element(link).not.toHaveAttribute("data-hover");
      await link.hover();
      await expect.element(link).toHaveAttribute("data-hover", "");
      await expect.element(link).toHaveAttribute("href", "#alice");
    },
  );
});

describe("Description registry parity", () => {
  parityTest("supports a provider without descriptions", () => {
    mount(() => <DescriptionHarness>No description</DescriptionHarness>);
    const owner = required(
      host?.querySelector<HTMLElement>("[data-description-owner]"),
      "Expected description owner",
    );
    expect(owner.hasAttribute("aria-describedby")).toBe(false);
  });

  parityTest("links one registered Description", () => {
    mount(() => (
      <DescriptionHarness>
        <Description>I am a description</Description>
        <span>Contents</span>
      </DescriptionHarness>
    ));
    const owner = required(
      host?.querySelector<HTMLElement>("[data-description-owner]"),
      "Expected description owner",
    );
    const description = required(
      host?.querySelector<HTMLElement>("[id^='headlessui-description-']"),
      "Expected a description",
    );
    expect(idRefs(owner, "aria-describedby")).toEqual([description.id]);
  });

  parityTest("links multiple Descriptions in registration order", () => {
    mount(() => (
      <DescriptionHarness>
        <Description>I am a description</Description>
        <span>Contents</span>
        <Description>I am also a description</Description>
      </DescriptionHarness>
    ));
    const owner = required(
      host?.querySelector<HTMLElement>("[data-description-owner]"),
      "Expected description owner",
    );
    const ids = [...host!.querySelectorAll<HTMLElement>(
      "[id^='headlessui-description-']",
    )].map((description) => description.id);
    expect(idRefs(owner, "aria-describedby")).toEqual(ids);
  });
});

describe("Label registry parity", () => {
  parityTest("supports a provider without labels", () => {
    mount(() => <LabelHarness>No label</LabelHarness>);
    const owner = required(
      host?.querySelector<HTMLElement>("[data-label-owner]"),
      "Expected label owner",
    );
    expect(owner.hasAttribute("aria-labelledby")).toBe(false);
  });

  parityTest("links one registered Label", () => {
    mount(() => (
      <LabelHarness>
        <Label>I am a label</Label>
        <span>Contents</span>
      </LabelHarness>
    ));
    const owner = required(
      host?.querySelector<HTMLElement>("[data-label-owner]"),
      "Expected label owner",
    );
    const label = required(
      host?.querySelector<HTMLElement>("[id^='headlessui-label-']"),
      "Expected a label",
    );
    expect(idRefs(owner, "aria-labelledby")).toEqual([label.id]);
  });

  parityTest("links multiple Labels in registration order", () => {
    mount(() => (
      <LabelHarness>
        <Label>I am a label</Label>
        <span>Contents</span>
        <Label>I am also a label</Label>
      </LabelHarness>
    ));
    const owner = required(
      host?.querySelector<HTMLElement>("[data-label-owner]"),
      "Expected label owner",
    );
    const ids = [...host!.querySelectorAll<HTMLElement>(
      "[id^='headlessui-label-']",
    )].map((label) => label.id);
    expect(idRefs(owner, "aria-labelledby")).toEqual(ids);
  });
});

describe("Field parity", () => {
  parityTest("renders an enabled Field", () => {
    const container = mount(() => (
      <Field>
        <input />
      </Field>
    ));
    expect(container.firstElementChild?.getAttribute("aria-disabled")).toBe(
      null,
    );
  });

  parityTest("exposes disabled state through its render prop", () => {
    mount(() => (
      <Field>
        {(slot) => (
          <div data-field-slot={JSON.stringify(slot)}>
            <input />
          </div>
        )}
      </Field>
    ));
    expect(
      host?.querySelector("[data-field-slot]")?.getAttribute(
        "data-field-slot",
      ),
    ).toBe(JSON.stringify({ disabled: false }));
  });

  parityTest("adds aria-disabled when directly disabled", () => {
    const container = mount(() => (
      <Field disabled>
        <input />
      </Field>
    ));
    expect(container.firstElementChild?.getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  parityTest("inherits disabled state from a parent Fieldset", () => {
    const container = mount(() => (
      <Fieldset disabled>
        <Field>
          <input />
        </Field>
      </Fieldset>
    ));
    const fieldset = required(
      container.querySelector("fieldset"),
      "Expected fieldset",
    );
    const field = required(
      fieldset.firstElementChild,
      "Expected nested Field",
    );
    expect(fieldset.hasAttribute("disabled")).toBe(true);
    expect(field.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("Fieldset and Legend parity", () => {
  parityTest("renders a native fieldset without a group role", () => {
    const container = mount(() => (
      <Fieldset>
        <input />
      </Fieldset>
    ));
    const fieldset = required(
      container.firstElementChild,
      "Expected fieldset",
    );
    expect(fieldset).toBeInstanceOf(HTMLFieldSetElement);
    expect(fieldset.hasAttribute("role")).toBe(false);
  });

  parityTest("renders a custom Fieldset as an ARIA group", () => {
    const container = mount(() => (
      <Fieldset as="span">
        <input />
      </Fieldset>
    ));
    const fieldset = required(
      container.firstElementChild,
      "Expected custom fieldset",
    );
    expect(fieldset).toBeInstanceOf(HTMLSpanElement);
    expect(fieldset.getAttribute("role")).toBe("group");
  });

  parityTest("forwards disabled to a native fieldset", () => {
    const container = mount(() => (
      <Fieldset disabled>
        <input />
      </Fieldset>
    ));
    expect(container.firstElementChild?.hasAttribute("disabled")).toBe(true);
  });

  parityTest("uses aria-disabled for a custom Fieldset", () => {
    const container = mount(() => (
      <Fieldset as="span" disabled>
        <input />
      </Fieldset>
    ));
    expect(container.firstElementChild?.getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  parityTest("native disabled semantics reach nested inputs", () => {
    mount(() => (
      <Fieldset disabled>
        <input />
      </Fieldset>
    ));
    const input = required(host?.querySelector("input"), "Expected input");
    expect(input.matches(":disabled")).toBe(true);
  });

  parityTest("links a Fieldset to its Legend", () => {
    mount(() => (
      <Fieldset>
        <Legend>My Legend</Legend>
        <input />
      </Fieldset>
    ));
    const fieldset = required(
      host?.querySelector("fieldset"),
      "Expected fieldset",
    );
    const legend = required(
      host?.querySelector<HTMLElement>("[id^='headlessui-label-']"),
      "Expected Legend label",
    );
    expect(idRefs(fieldset, "aria-labelledby")).toEqual([legend.id]);
  });

  parityTest("keeps nested Field labels separate from the Legend", () => {
    mount(() => (
      <Fieldset>
        <Legend>My Legend</Legend>
        <Field>
          <Label>My Label</Label>
          <Input />
        </Field>
      </Fieldset>
    ));
    const fieldset = required(
      host?.querySelector("fieldset"),
      "Expected fieldset",
    );
    const input = required(host?.querySelector("input"), "Expected input");
    const labels = [...host!.querySelectorAll<HTMLElement>(
      "[id^='headlessui-label-']",
    )];
    expect(labels).toHaveLength(2);
    expect(idRefs(fieldset, "aria-labelledby")).toEqual([labels[0].id]);
    expect(idRefs(input, "aria-labelledby")).toEqual([labels[1].id]);
    expect(idRefs(input, "aria-labelledby")).not.toContain(labels[0].id);
  });

  parityTest("Legend exposes inherited disabled state", () => {
    mount(() => (
      <Fieldset disabled>
        <Legend>
          {(slot) => slot.disabled ? "Disabled legend" : "Enabled legend"}
        </Legend>
      </Fieldset>
    ));
    const legend = page.getByText("Disabled legend", { exact: true });
    expect(legend.element().hasAttribute("data-disabled")).toBe(true);
  });
});
