import type { Element } from "solid-js";
import { renderToString } from "@solidjs/web";
import { Description } from "../../src/components/description/description.tsx";
import { Field } from "../../src/components/field/field.tsx";
import { Fieldset } from "../../src/components/fieldset/fieldset.tsx";
import { Label } from "../../src/components/label/label.tsx";
import { Legend } from "../../src/components/legend/legend.tsx";
import { useDisabled } from "../../src/internal/disabled.tsx";
import { useProvidedId } from "../../src/internal/id.tsx";
import { useDescribedBy } from "../../src/components/description/description.tsx";
import { useLabelledBy } from "../../src/components/label/label.tsx";

function IntegratedControl(): Element {
  const describedBy = useDescribedBy();
  const disabled = useDisabled();
  const id = useProvidedId();
  const labelledBy = useLabelledBy();

  return (
    <input
      aria-describedby={describedBy()}
      aria-labelledby={labelledBy()}
      disabled={disabled() || undefined}
      id={id()}
    />
  );
}

export function renderFieldFamily(): string {
  return renderToString(() => (
    <Field
      class={(slot) => slot.disabled ? "field-disabled" : "field-enabled"}
      disabled
    >
      {(slot) => (
        <>
          <span data-field-slot={slot.disabled ? "disabled" : "enabled"} />
          <Label id="label-primary">Primary label</Label>
          <Label id="label-secondary">Secondary label</Label>
          <Description id="description-primary">
            Primary description
          </Description>
          <Description id="description-secondary">
            Secondary description
          </Description>
          <IntegratedControl />
        </>
      )}
    </Field>
  ));
}

export function renderNestedFieldset(): string {
  return renderToString(() => (
    <Fieldset disabled>
      <Legend id="fieldset-legend">Account</Legend>
      <Field disabled={false}>
        <Label id="field-label">Email</Label>
        <Description id="field-description">Work email</Description>
        <IntegratedControl />
      </Field>
    </Fieldset>
  ));
}

export function renderCustomFieldset(): string {
  return renderToString(() => (
    <Fieldset as="section" disabled>
      <Legend id="custom-legend">Preferences</Legend>
    </Fieldset>
  ));
}

export function renderPassiveLabel(): string {
  return renderToString(() => (
    <Field>
      <Label id="passive-label" passive>Passive</Label>
      <IntegratedControl />
    </Field>
  ));
}

export function renderGeneratedField(): string {
  return renderToString(() => (
    <Field>
      <Label>Generated label</Label>
      <Description>Generated description</Description>
      <IntegratedControl />
    </Field>
  ));
}

export function renderOrphanLabel(): string {
  return renderToString(() => <Label>Orphan</Label>);
}

export function renderOrphanDescription(): string {
  return renderToString(() => <Description>Orphan</Description>);
}
