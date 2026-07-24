import { renderToString } from "@solidjs/web";
import { Checkbox } from "../../src/components/checkbox/checkbox.tsx";
import { Description } from "../../src/components/description/description.tsx";
import { Field } from "../../src/components/field/field.tsx";
import { Label } from "../../src/components/label/label.tsx";
import {
  Switch,
  SwitchDescription,
  SwitchGroup,
  SwitchLabel,
} from "../../src/components/switch/switch.tsx";

export function renderCheckboxStates(): string {
  return renderToString(() => (
    <>
      <Checkbox
        id="checked-checkbox"
        autofocus
        defaultChecked
        name="terms"
        value="accepted"
        class={(slot) => slot.checked ? "checked" : "unchecked"}
      >
        {(slot) => slot.checked ? "Accepted" : "Declined"}
      </Checkbox>
      <Checkbox id="mixed-checkbox" disabled indeterminate>
        Mixed
      </Checkbox>
    </>
  ));
}

export function renderFieldCheckbox(): string {
  return renderToString(() => (
    <Field disabled>
      <Label id="checkbox-label">Terms</Label>
      <Description id="checkbox-description">Required</Description>
      <Checkbox />
    </Field>
  ));
}

export function renderSwitchStates(): string {
  return renderToString(() => (
    <>
      <Switch
        id="enabled-switch"
        autofocus
        defaultChecked
        name="notifications"
        tabindex={-1}
        value="enabled"
        class={(slot) => slot.checked ? "enabled" : "disabled"}
      >
        {(slot) => slot.checked ? "On" : "Off"}
      </Switch>
      <Switch id="span-switch" as="span" checked={false} disabled>
        Custom
      </Switch>
    </>
  ));
}

export function renderSwitchGroup(): string {
  return renderToString(() => (
    <SwitchGroup>
      <SwitchLabel id="switch-label">Notifications</SwitchLabel>
      <SwitchDescription id="switch-description">
        Receive product updates
      </SwitchDescription>
      <Switch id="group-switch" />
    </SwitchGroup>
  ));
}

export function renderStaticAliases(): string {
  return renderToString(() => (
    <Switch.Group>
      <Switch.Label id="static-label">Static label</Switch.Label>
      <Switch.Description id="static-description">
        Static description
      </Switch.Description>
      <Switch id="static-switch" />
    </Switch.Group>
  ));
}
