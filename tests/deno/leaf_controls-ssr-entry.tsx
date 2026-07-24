import { renderToString } from "@solidjs/web";
import { DataInteractive } from "../../src/components/data-interactive/data-interactive.tsx";
import { Description } from "../../src/components/description/description.tsx";
import { Field } from "../../src/components/field/field.tsx";
import { Input } from "../../src/components/input/input.tsx";
import { Label } from "../../src/components/label/label.tsx";
import { Select } from "../../src/components/select/select.tsx";
import { Textarea } from "../../src/components/textarea/textarea.tsx";

export function renderDataInteractiveLink(): string {
  return renderToString(() => (
    <DataInteractive
      as="a"
      href="/profile"
      class={(slot) => ({ active: slot.active, idle: !slot.active })}
    >
      Profile
    </DataInteractive>
  ));
}

export function renderInvalidControls(): string {
  return renderToString(() => (
    <>
      <Input
        id="email"
        name="email"
        value="alice@example.com"
        aria-labelledby="email-label"
        aria-describedby="email-help"
        aria-invalid="grammar"
        autofocus
        disabled
        invalid
        class={(slot) => ({ invalid: slot.invalid })}
      />
      <Select
        id="country"
        name="country"
        value="il"
        aria-labelledby="country-label"
        autofocus
        disabled
        invalid
      >
        <option value="il">Israel</option>
        <option value="nl">Netherlands</option>
      </Select>
      <Textarea
        id="bio"
        name="bio"
        value="Hello"
        aria-describedby="bio-help"
        autofocus
        disabled
        invalid
      />
    </>
  ));
}

export function renderDirectAriaControls(): string {
  return renderToString(() => (
    <>
      <Input
        id="direct-input"
        aria-labelledby="direct-input-label"
        aria-describedby="direct-input-help"
        aria-invalid="grammar"
      />
      <Textarea id="direct-textarea" aria-invalid="spelling" />
    </>
  ));
}

export function renderGeneratedIds(): string {
  return renderToString(() => (
    <>
      <Input />
      <Select>
        <option>One</option>
      </Select>
      <Textarea />
    </>
  ));
}

export function renderInheritedFieldControls(): string {
  return renderToString(() => (
    <>
      <Field disabled>
        <Label id="inherited-input-label">Input label</Label>
        <Description id="inherited-input-description">
          Input description
        </Description>
        <Input name="inherited-input" />
      </Field>
      <Field disabled>
        <Label id="inherited-select-label">Select label</Label>
        <Description id="inherited-select-description">
          Select description
        </Description>
        <Select name="inherited-select">
          <option>One</option>
        </Select>
      </Field>
      <Field disabled>
        <Label id="inherited-textarea-label">Textarea label</Label>
        <Description id="inherited-textarea-description">
          Textarea description
        </Description>
        <Textarea name="inherited-textarea" />
      </Field>
    </>
  ));
}

export function renderExplicitFieldOverrides(): string {
  return renderToString(() => (
    <>
      <Field disabled>
        <Label id="context-input-label">Context input label</Label>
        <Description id="context-input-description">
          Context input description
        </Description>
        <Input
          id="explicit-input"
          name="explicit-input"
          disabled={false}
          aria-labelledby="direct-input-label"
          aria-describedby="direct-input-description"
        />
      </Field>
      <Field disabled>
        <Label id="context-select-label">Context select label</Label>
        <Description id="context-select-description">
          Context select description
        </Description>
        <Select
          id="explicit-select"
          name="explicit-select"
          disabled={false}
          aria-labelledby="direct-select-label"
          aria-describedby="direct-select-description"
        >
          <option>One</option>
        </Select>
      </Field>
      <Field disabled>
        <Label id="context-textarea-label">Context textarea label</Label>
        <Description id="context-textarea-description">
          Context textarea description
        </Description>
        <Textarea
          id="explicit-textarea"
          name="explicit-textarea"
          disabled={false}
          aria-labelledby="direct-textarea-label"
          aria-describedby="direct-textarea-description"
        />
      </Field>
    </>
  ));
}
