import { renderToString } from "@solidjs/web";
import { Description } from "../../src/components/description/description.tsx";
import { Field } from "../../src/components/field/field.tsx";
import { Label } from "../../src/components/label/label.tsx";
import {
  Radio,
  RadioGroup,
  RadioGroupDescription,
  RadioGroupLabel,
  RadioGroupOption,
} from "../../src/components/radio-group/radio-group.tsx";

export function renderSelectedGroup(): string {
  return renderToString(() => (
    <RadioGroup value="delivery" name="fulfilment" form="checkout">
      <RadioGroup.Label id="fulfilment-label">Fulfilment</RadioGroup.Label>
      <RadioGroup.Description id="fulfilment-description">
        Choose one option
      </RadioGroup.Description>
      <Radio id="pickup-radio" value="pickup">Pickup</Radio>
      <Radio id="delivery-radio" value="delivery">Delivery</Radio>
    </RadioGroup>
  ));
}

export function renderLegacyGroup(): string {
  return renderToString(() => (
    <RadioGroup defaultValue="beta">
      <RadioGroup.Option value="alpha">
        {(slot) => (
          <>
            <RadioGroup.Label id="alpha-label">Alpha</RadioGroup.Label>
            <RadioGroup.Description id="alpha-description">
              Alpha description
            </RadioGroup.Description>
            <span>{slot.checked ? "selected" : "idle"}</span>
          </>
        )}
      </RadioGroup.Option>
      <RadioGroup.Option value="beta">Beta</RadioGroup.Option>
    </RadioGroup>
  ));
}

export function renderObjectGroup(): string {
  return renderToString(() => (
    <RadioGroup
      by="id"
      value={{ id: 2, name: "Current Bob" }}
      name="person"
    >
      <Radio value={{ id: 1, name: "Alice" }}>Alice</Radio>
      <Radio value={{ id: 2, name: "Bob" }}>Bob</Radio>
    </RadioGroup>
  ));
}

export function renderFieldRadios(): string {
  return renderToString(() => (
    <RadioGroup value="yes">
      <Field disabled>
        <Label id="field-radio-label">Field radio</Label>
        <Description id="field-radio-description">
          Field radio description
        </Description>
        <Radio value="yes" />
      </Field>
      <Field disabled>
        <Label id="explicit-radio-label">Explicit radio</Label>
        <Description id="explicit-radio-description">
          Explicit radio description
        </Description>
        <Radio id="explicit-radio" value="no" disabled={false} />
      </Field>
    </RadioGroup>
  ));
}

export function renderDisabledFormGroup(): string {
  return renderToString(() => (
    <RadioGroup value="pickup" name="delivery" disabled>
      <Radio value="pickup">Pickup</Radio>
    </RadioGroup>
  ));
}

export function staticsArePreserved(): boolean {
  return RadioGroup.Option === RadioGroupOption &&
    RadioGroup.Radio === Radio &&
    RadioGroup.Label === RadioGroupLabel &&
    RadioGroup.Description === RadioGroupDescription;
}

export function renderOrphanRadio(): string {
  return renderToString(() => <Radio value="orphan" />);
}

export function renderOrphanOption(): string {
  return renderToString(() => <RadioGroupOption value="orphan" />);
}
