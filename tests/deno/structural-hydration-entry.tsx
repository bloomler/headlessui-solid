import { hydrate, renderToString } from "@solidjs/web";
import { createSignal, flush } from "solid-js";
import { Checkbox } from "../../src/components/checkbox/checkbox.tsx";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxLabel,
  ComboboxOption,
  ComboboxOptions,
} from "../../src/components/combobox/combobox.tsx";
import { Description } from "../../src/components/description/description.tsx";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "../../src/components/disclosure/disclosure.tsx";
import { Field } from "../../src/components/field/field.tsx";
import {
  FocusTrap,
  FocusTrapFeatures,
} from "../../src/components/focus-trap/focus-trap.tsx";
import { Input } from "../../src/components/input/input.tsx";
import { Label } from "../../src/components/label/label.tsx";
import {
  Listbox,
  ListboxButton,
  ListboxLabel,
  ListboxOption,
  ListboxOptions,
} from "../../src/components/listbox/listbox.tsx";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from "../../src/components/menu/menu.tsx";
import {
  Popover,
  PopoverButton,
  PopoverPanel,
} from "../../src/components/popover/popover.tsx";
import { Portal } from "../../src/components/portal/portal.tsx";
import {
  Radio,
  RadioGroup,
  RadioGroupDescription,
  RadioGroupLabel,
} from "../../src/components/radio-group/radio-group.tsx";
import { Select } from "../../src/components/select/select.tsx";
import {
  Switch,
  SwitchDescription,
  SwitchGroup,
  SwitchLabel,
} from "../../src/components/switch/switch.tsx";
import { Textarea } from "../../src/components/textarea/textarea.tsx";
import { Transition } from "../../src/components/transition/transition.tsx";
import {
  assertSolidDiagnosticsCapture,
  captureSolidDiagnostics,
} from "./solid-diagnostics.ts";

function StructuralHydrationFixture() {
  const [portalCount, setPortalCount] = createSignal(0);
  const [transitionVisible, setTransitionVisible] = createSignal(true);
  const [trapFeatures, setTrapFeatures] = createSignal(
    FocusTrapFeatures.None,
  );
  const [trapCount, setTrapCount] = createSignal(0);
  const [menuSelection, setMenuSelection] = createSignal("none");
  const [listboxValue, setListboxValue] = createSignal("Alpha");
  const [comboboxValue, setComboboxValue] = createSignal("Alpha");
  const [checkboxValue, setCheckboxValue] = createSignal(false);
  const [switchValue, setSwitchValue] = createSignal(false);
  const [radioValue, setRadioValue] = createSignal("Alpha");
  const [inputValue, setInputValue] = createSignal("server input");
  const [selectValue, setSelectValue] = createSignal("alpha");
  const [textareaValue, setTextareaValue] = createSignal("server textarea");
  let trapInitialFocus: HTMLButtonElement | undefined;

  return (
    <main data-hydration-shell="structural-families">
      <form id="structural-hydration-form" />
      <section data-family="portal">
        <span data-hydration-node="portal-anchor">Portal anchor</span>
        <Portal>
          <div data-hydration-node="portal-content">
            <button
              data-action="portal-increment"
              type="button"
              onClick={() => setPortalCount((count) => count + 1)}
            >
              Increment portal
            </button>
            <output data-state="portal">{portalCount()}</output>
          </div>
        </Portal>
      </section>

      <section data-family="transition">
        <button
          data-action="transition-toggle"
          type="button"
          onClick={() => setTransitionVisible((visible) => !visible)}
        >
          Toggle transition
        </button>
        <Transition
          as="div"
          data-hydration-node="transition"
          show={transitionVisible()}
          transition={false}
          unmount={false}
        >
          Transition contents
        </Transition>
        <output data-state="transition">
          {transitionVisible() ? "visible" : "hidden"}
        </output>
      </section>

      <section data-family="focus-trap">
        <button
          data-action="focus-trap-toggle"
          type="button"
          onClick={() =>
            setTrapFeatures((features) =>
              features === FocusTrapFeatures.None
                ? FocusTrapFeatures.InitialFocus | FocusTrapFeatures.TabLock
                : FocusTrapFeatures.None
            )}
        >
          Toggle focus guards
        </button>
        <FocusTrap
          data-hydration-node="focus-trap"
          features={trapFeatures()}
          initialFocus={() => trapInitialFocus}
        >
          <button
            data-action="focus-trap-increment"
            ref={(element) => trapInitialFocus = element}
            type="button"
            onClick={() => setTrapCount((count) => count + 1)}
          >
            Increment trap
          </button>
          <output data-state="focus-trap">{trapCount()}</output>
        </FocusTrap>
      </section>

      <section data-family="popover">
        <Popover data-hydration-node="popover-root">
          {(slot) => (
            <>
              <output data-state="popover">
                {slot.open ? "open" : "closed"}
              </output>
              <PopoverButton data-hydration-node="popover-button">
                Toggle popover
              </PopoverButton>
              <PopoverPanel
                data-hydration-node="popover-panel"
                modal={false}
                unmount={false}
              >
                {(panel) => (
                  <>
                    Popover contents
                    <button
                      data-action="popover-close"
                      type="button"
                      onClick={() => panel.close()}
                    >
                      Close popover
                    </button>
                  </>
                )}
              </PopoverPanel>
            </>
          )}
        </Popover>
      </section>

      <section data-family="disclosure">
        <Disclosure as="div" data-hydration-node="disclosure-root">
          {(slot) => (
            <>
              <output data-state="disclosure">
                {slot.open ? "open" : "closed"}
              </output>
              <DisclosureButton data-hydration-node="disclosure-button">
                Toggle disclosure
              </DisclosureButton>
              <DisclosurePanel
                data-hydration-node="disclosure-panel"
                unmount={false}
              >
                Disclosure contents
              </DisclosurePanel>
            </>
          )}
        </Disclosure>
      </section>

      <section data-family="menu">
        <Menu as="div" data-hydration-node="menu-root">
          {(slot) => (
            <>
              <output data-state="menu-open">
                {slot.open ? "open" : "closed"}
              </output>
              <MenuButton data-hydration-node="menu-button">
                Toggle menu
              </MenuButton>
              <MenuItems
                data-hydration-node="menu-items"
                modal={false}
                unmount={false}
              >
                <MenuItem
                  data-hydration-node="menu-item"
                  onClick={() => setMenuSelection("Profile")}
                >
                  Profile
                </MenuItem>
              </MenuItems>
            </>
          )}
        </Menu>
        <output data-state="menu-selection">{menuSelection()}</output>
      </section>

      <section data-family="listbox">
        <Listbox
          as="div"
          data-hydration-node="listbox-root"
          form="structural-hydration-form"
          name="listbox-person"
          value={listboxValue()}
          onChange={setListboxValue}
        >
          {(slot) => (
            <>
              <output data-state="listbox-open">
                {slot.open ? "open" : "closed"}
              </output>
              <ListboxLabel data-hydration-node="listbox-label">
                Person
              </ListboxLabel>
              <ListboxButton data-hydration-node="listbox-button">
                {listboxValue()}
              </ListboxButton>
              <ListboxOptions
                data-hydration-node="listbox-options"
                modal={false}
                unmount={false}
              >
                <ListboxOption
                  data-hydration-node="listbox-option-alpha"
                  value="Alpha"
                >
                  Alpha
                </ListboxOption>
                <ListboxOption
                  data-hydration-node="listbox-option-bravo"
                  value="Bravo"
                >
                  Bravo
                </ListboxOption>
              </ListboxOptions>
            </>
          )}
        </Listbox>
        <output data-state="listbox-selection">{listboxValue()}</output>
      </section>

      <section data-family="combobox">
        <Combobox
          as="div"
          data-hydration-node="combobox-root"
          form="structural-hydration-form"
          name="combobox-person"
          value={comboboxValue()}
          onChange={setComboboxValue}
        >
          {(slot) => (
            <>
              <output data-state="combobox-open">
                {slot.open ? "open" : "closed"}
              </output>
              <ComboboxLabel data-hydration-node="combobox-label">
                Person
              </ComboboxLabel>
              <ComboboxInput
                data-hydration-node="combobox-input"
                displayValue={(value: string) => value}
              />
              <ComboboxButton data-hydration-node="combobox-button">
                Toggle combobox
              </ComboboxButton>
              <ComboboxOptions
                data-hydration-node="combobox-options"
                modal={false}
                unmount={false}
              >
                <ComboboxOption
                  data-hydration-node="combobox-option-alpha"
                  value="Alpha"
                >
                  Alpha
                </ComboboxOption>
                <ComboboxOption
                  data-hydration-node="combobox-option-bravo"
                  value="Bravo"
                >
                  Bravo
                </ComboboxOption>
              </ComboboxOptions>
            </>
          )}
        </Combobox>
        <output data-state="combobox-selection">{comboboxValue()}</output>
      </section>

      <section data-family="form-controls">
        <Field>
          <Label>Terms</Label>
          <Description>Accept the terms</Description>
          <Checkbox
            checked={checkboxValue()}
            data-hydration-node="checkbox"
            form="structural-hydration-form"
            name="terms"
            onChange={setCheckboxValue}
            value="accepted"
          >
            Checkbox
          </Checkbox>
        </Field>
        <SwitchGroup>
          <SwitchLabel>Notifications</SwitchLabel>
          <SwitchDescription>Receive notifications</SwitchDescription>
          <Switch
            checked={switchValue()}
            data-hydration-node="switch"
            form="structural-hydration-form"
            name="notifications"
            onChange={setSwitchValue}
            value="enabled"
          >
            Switch
          </Switch>
        </SwitchGroup>
        <RadioGroup
          data-hydration-node="radio-group"
          form="structural-hydration-form"
          name="delivery"
          value={radioValue()}
          onChange={setRadioValue}
        >
          <RadioGroupLabel>Delivery method</RadioGroupLabel>
          <RadioGroupDescription>Choose one</RadioGroupDescription>
          <Radio data-hydration-node="radio-alpha" value="Alpha">
            Alpha
          </Radio>
          <Radio data-hydration-node="radio-bravo" value="Bravo">
            Bravo
          </Radio>
        </RadioGroup>
        <Field>
          <Label>Input label</Label>
          <Description>Input description</Description>
          <Input
            data-hydration-node="input"
            form="structural-hydration-form"
            name="input"
            value={inputValue()}
            onInput={(event) => setInputValue(event.currentTarget.value)}
          />
        </Field>
        <Field>
          <Label>Select label</Label>
          <Description>Select description</Description>
          <Select
            data-hydration-node="select"
            form="structural-hydration-form"
            name="select"
            value={selectValue()}
            onChange={(event) => setSelectValue(event.currentTarget.value)}
          >
            <option value="alpha">Alpha</option>
            <option value="bravo">Bravo</option>
          </Select>
        </Field>
        <Field>
          <Label>Textarea label</Label>
          <Description>Textarea description</Description>
          <Textarea
            data-hydration-node="textarea"
            form="structural-hydration-form"
            name="textarea"
            value={textareaValue()}
            onInput={(event) => setTextareaValue(event.currentTarget.value)}
          />
        </Field>
        <output data-state="checkbox">{String(checkboxValue())}</output>
        <output data-state="switch">{String(switchValue())}</output>
        <output data-state="radio">{radioValue()}</output>
        <output data-state="input">{inputValue()}</output>
        <output data-state="select">{selectValue()}</output>
        <output data-state="textarea">{textareaValue()}</output>
      </section>
    </main>
  );
}

export function renderStructuralHydrationFixture(): string {
  return renderToString(() => <StructuralHydrationFixture />);
}

export function assertStructuralDiagnosticCapture(): void {
  assertSolidDiagnosticsCapture();
}

export function hydrateStructuralFixture(element: HTMLElement): {
  diagnosticDetails(): string[];
  dispose(): void;
  frame(): Promise<void>;
  flush(): void;
} {
  const diagnostics = captureSolidDiagnostics();
  const dispose = hydrate(() => <StructuralHydrationFixture />, element);
  return {
    diagnosticDetails: diagnostics.stop,
    dispose,
    frame: () =>
      new Promise((resolve) => requestAnimationFrame(() => resolve())),
    flush,
  };
}
