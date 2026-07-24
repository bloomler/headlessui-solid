/**
 * Compile-only consumer coverage for the public package entry point.
 *
 * This file is intentionally not a `*_test.tsx` module: `deno check` validates
 * it, while `deno test` must not execute components that require a browser.
 */
import { type Component, createSignal, type Element } from "solid-js";
import type { JSX } from "@solidjs/web";
import {
  Button,
  type ButtonProps,
  Checkbox,
  type CheckboxProps,
  CloseButton,
  type CloseButtonProps,
  Combobox,
  type ComboboxAnchor,
  type ComboboxAnchorConfig,
  type ComboboxAnchorTo,
  ComboboxButton,
  type ComboboxButtonProps,
  ComboboxInput,
  type ComboboxInputChangeEvent,
  type ComboboxInputProps,
  ComboboxLabel,
  type ComboboxLabelProps,
  type ComboboxLabelRenderPropArg,
  ComboboxOption,
  type ComboboxOptionProps,
  ComboboxOptions,
  type ComboboxOptionsProps,
  type ComboboxProps,
  DataInteractive,
  type DataInteractiveProps,
  Description,
  type DescriptionProps,
  Dialog,
  DialogBackdrop,
  type DialogBackdropProps,
  DialogDescription,
  DialogPanel,
  type DialogPanelProps,
  type DialogProps,
  DialogTitle,
  type DialogTitleProps,
  Disclosure,
  DisclosureButton,
  type DisclosureButtonProps,
  DisclosurePanel,
  type DisclosurePanelProps,
  type DisclosureProps,
  Field,
  type FieldProps,
  Fieldset,
  type FieldsetProps,
  FocusTrap,
  FocusTrapFeatures,
  type FocusTrapProps,
  Input,
  type InputProps,
  Label,
  type LabelProps,
  Legend,
  type LegendProps,
  Listbox,
  type ListboxAnchor,
  type ListboxAnchorConfig,
  type ListboxAnchorTo,
  ListboxButton,
  type ListboxButtonProps,
  ListboxLabel,
  type ListboxLabelProps,
  type ListboxLabelRenderPropArg,
  ListboxOption,
  type ListboxOptionProps,
  ListboxOptions,
  type ListboxOptionsProps,
  type ListboxProps,
  ListboxSelectedOption,
  type ListboxSelectedOptionProps,
  Menu,
  type MenuAnchor,
  type MenuAnchorConfig,
  type MenuAnchorTo,
  MenuButton,
  type MenuButtonProps,
  MenuHeading,
  type MenuHeadingProps,
  MenuItem,
  type MenuItemProps,
  MenuItems,
  type MenuItemsProps,
  type MenuProps,
  MenuSection,
  type MenuSectionProps,
  MenuSeparator,
  type MenuSeparatorProps,
  Popover,
  type PopoverAnchor,
  type PopoverAnchorConfig,
  type PopoverAnchorTo,
  PopoverBackdrop,
  type PopoverBackdropProps,
  PopoverButton,
  type PopoverButtonProps,
  PopoverGroup,
  type PopoverGroupProps,
  PopoverOverlay,
  type PopoverOverlayProps,
  PopoverPanel,
  type PopoverPanelProps,
  type PopoverProps,
  Portal,
  Radio,
  RadioGroup,
  RadioGroupDescription,
  RadioGroupLabel,
  RadioGroupOption,
  type RadioGroupProps,
  type RadioOptionProps,
  type RadioProps,
  type Ref,
  Select,
  type SelectProps,
  Switch,
  SwitchDescription,
  SwitchGroup,
  type SwitchGroupProps,
  SwitchLabel,
  type SwitchProps,
  Tab,
  TabGroup,
  type TabGroupProps,
  TabList,
  type TabListProps,
  TabPanel,
  type TabPanelProps,
  TabPanels,
  type TabPanelsProps,
  type TabProps,
  Textarea,
  type TextareaProps,
  Transition,
  TransitionChild,
  type TransitionChildProps,
  type TransitionClasses,
  type TransitionEvents,
  type TransitionRootProps,
  useClose,
} from "@bloomler/headlessui-solid";

interface Person {
  id: number;
  name: string;
}

const people: readonly Person[] = [
  { id: 1, name: "Ada" },
  { id: 2, name: "Grace" },
];

/** The prop names promised by the React 2.2.10 parity audit. */
export type IntendedNamedTypeSurface = readonly [
  ButtonProps,
  CheckboxProps,
  CloseButtonProps,
  ComboboxProps<Person, false, "section">,
  ComboboxButtonProps,
  ComboboxInputProps<"input", Person>,
  ComboboxLabelProps,
  ComboboxLabelRenderPropArg,
  ComboboxOptionProps<"div", Person>,
  ComboboxOptionsProps<"div", Person>,
  DataInteractiveProps<"button">,
  DescriptionProps,
  DialogProps,
  DialogBackdropProps,
  DialogPanelProps,
  DialogTitleProps,
  DisclosureProps,
  DisclosureButtonProps,
  DisclosurePanelProps,
  FieldProps,
  FieldsetProps,
  FocusTrapProps,
  InputProps,
  LabelProps,
  LegendProps,
  ListboxProps<"section", Person[], Person>,
  ListboxButtonProps,
  ListboxLabelProps,
  ListboxLabelRenderPropArg,
  ListboxOptionProps<"div", Person>,
  ListboxOptionsProps,
  ListboxSelectedOptionProps,
  MenuProps,
  MenuButtonProps,
  MenuHeadingProps,
  MenuItemProps,
  MenuItemsProps,
  MenuSectionProps,
  MenuSeparatorProps,
  PopoverProps,
  PopoverBackdropProps,
  PopoverButtonProps,
  PopoverGroupProps,
  PopoverOverlayProps,
  PopoverPanelProps,
  RadioProps<"div", Person>,
  RadioGroupProps<"div", Person>,
  RadioOptionProps<"div", Person>,
  SelectProps,
  SwitchProps,
  SwitchGroupProps,
  TabProps,
  TabGroupProps,
  TabListProps,
  TabPanelProps,
  TabPanelsProps,
  TextareaProps,
  TransitionChildProps,
  TransitionRootProps,
  TransitionClasses,
  TransitionEvents,
  ComboboxInputChangeEvent,
];

/** These aliases make each floating-anchor spelling part of the checked API. */
export const publicAnchors: Readonly<{
  combobox: ComboboxAnchor;
  comboboxConfig: ComboboxAnchorConfig;
  comboboxTo: ComboboxAnchorTo;
  listbox: ListboxAnchor;
  listboxConfig: ListboxAnchorConfig;
  listboxTo: ListboxAnchorTo;
  menu: MenuAnchor;
  menuConfig: MenuAnchorConfig;
  menuTo: MenuAnchorTo;
  popover: PopoverAnchor;
  popoverConfig: PopoverAnchorConfig;
  popoverTo: PopoverAnchorTo;
}> = {
  combobox: "bottom start",
  comboboxConfig: { gap: 8, padding: "1rem", to: "bottom end" },
  comboboxTo: "top",
  listbox: "selection start",
  listboxConfig: { offset: 4, to: "selection end" },
  listboxTo: "selection",
  menu: false,
  menuConfig: { gap: 6, to: "right start" },
  menuTo: "left end",
  popover: "bottom",
  popoverConfig: { padding: 10, to: "top start" },
  popoverTo: "right end",
};

interface RouterLinkProps {
  children?: Element;
  class?: JSX.ClassValue;
  onClick?: JSX.EventHandlerUnion<HTMLAnchorElement, MouseEvent>;
  ref?: Ref<HTMLAnchorElement>;
  to: string;
}

const RouterLink: Component<RouterLinkProps> = (props) => props.children;

const nestedAnchorRef: Ref<HTMLAnchorElement> = [
  (element) => void element.href,
  [(element) => void element.focus()],
];

/**
 * Intrinsic and custom `as` props retain their native attributes, event target,
 * and ref element. Slot children and slot-driven classes stay strongly typed.
 */
export function PolymorphicConsumer(): Element {
  return (
    <main>
      <Button<"button">
        ref={(element) => {
          const button: HTMLButtonElement = element;
          void button.form;
        }}
        onClick={(event) => {
          const button: HTMLButtonElement = event.currentTarget;
          void button.formAction;
        }}
        class={(slot) => ({
          "is-active": slot.active,
          "is-disabled": slot.disabled,
        })}
      >
        {(slot) => <span>{slot.hover ? "hovered" : "idle"}</span>}
      </Button>

      <Button
        as="a"
        href="/account"
        ref={(element) => {
          const anchor: HTMLAnchorElement = element;
          void anchor.href;
        }}
        onClick={(event) => {
          const anchor: HTMLAnchorElement = event.currentTarget;
          void anchor.pathname;
        }}
      >
        Account
      </Button>

      <Button
        as={RouterLink}
        to="/docs"
        ref={nestedAnchorRef}
        onClick={(event) => {
          const anchor: HTMLAnchorElement = event.currentTarget;
          void anchor.href;
        }}
      >
        Docs
      </Button>

      <Menu as="nav" aria-label="Account actions">
        {(slot) => (
          <>
            <MenuButton
              onClick={(event) => {
                const button: HTMLButtonElement = event.currentTarget;
                void button.form;
              }}
            >
              Actions
            </MenuButton>
            <MenuItems
              anchor={{ gap: 4, to: "bottom end" }}
              class={(items) => ({ open: items.open })}
            >
              <MenuItem as={RouterLink} to="/profile">
                {(item) => item.focus ? "Focused profile" : "Profile"}
              </MenuItem>
            </MenuItems>
            <output>{slot.open ? "open" : "closed"}</output>
          </>
        )}
      </Menu>
    </main>
  );
}

/** Controlled scalar and multi-select APIs infer the application value type. */
export function ControlledSelectionConsumer(): Element {
  const [person, setPerson] = createSignal<Person>(people[0]);
  const [selectedPeople, setSelectedPeople] = createSignal<Person[]>([
    people[0],
  ]);
  const [checked, setChecked] = createSignal(false);
  const [dialogOpen, setDialogOpen] = createSignal(true);

  return (
    <>
      <Checkbox checked={checked()} onChange={setChecked}>
        {(slot) => slot.checked ? "Subscribed" : "Subscribe"}
      </Checkbox>

      <Combobox<Person, false, "section">
        as="section"
        by="id"
        value={person()}
        onChange={(value) => value && setPerson(value)}
        class={(slot) => ({ invalid: slot.invalid, open: slot.open })}
      >
        {(slot) => (
          <>
            <ComboboxLabel
              class={(label) => ({ open: label.open })}
            >
              {(label) => label.open ? "Open person" : "Person"}
            </ComboboxLabel>
            <ComboboxInput<Person>
              displayValue={(value) => value.name}
              ref={(element) => {
                const input: HTMLInputElement = element;
                void input.selectionStart;
              }}
              onInput={(event) => {
                const input: HTMLInputElement = event.currentTarget;
                void input.value;
              }}
              onChange={(event) => {
                const input: HTMLInputElement = event.currentTarget;
                void input.value;
              }}
            />
            <ComboboxButton class={(button) => ({ open: button.open })}>
              Toggle
            </ComboboxButton>
            <ComboboxOptions<Person>
              anchor={{ gap: 8, to: "bottom start" }}
              class={(options) => ({ open: options.open })}
            >
              {people.map((option) => (
                <ComboboxOption<Person>
                  value={option}
                  class={(state) => ({
                    focused: state.focus,
                    selected: state.selected,
                  })}
                >
                  {(state) => state.disabled ? "Unavailable" : option.name}
                </ComboboxOption>
              ))}
            </ComboboxOptions>
            <output>{slot.activeOption?.name}</output>
          </>
        )}
      </Combobox>

      <Combobox<Person, true, "section">
        as="section"
        by={(left, right) => left.id === right.id}
        multiple
        value={selectedPeople()}
        onChange={(value) => setSelectedPeople(value)}
      >
        <Combobox.Input<Person> displayValue={(value) => value.name} />
        <Combobox.Button>Choose people</Combobox.Button>
        <Combobox.Options<Person> anchor="top end">
          {people.map((option) => (
            <Combobox.Option<Person> value={option}>
              {option.name}
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox>

      <Listbox<"section", Person, Person>
        by="id"
        value={person()}
        onChange={setPerson}
      >
        {(slot) => (
          <>
            <ListboxLabel class={(label) => ({ open: label.open })}>
              {(label) => label.open ? "Open person" : "Person"}
            </ListboxLabel>
            <ListboxButton>{slot.value.name}</ListboxButton>
            <ListboxOptions anchor="selection start">
              {people.map((option) => (
                <ListboxOption<"div", Person> value={option}>
                  {(state) =>
                    state.selected ? `Selected ${option.name}` : option.name}
                </ListboxOption>
              ))}
            </ListboxOptions>
          </>
        )}
      </Listbox>

      <Listbox<"section", Person[], Person>
        by={(left, right) => left.id === right.id}
        multiple
        value={selectedPeople()}
        onChange={(value) => setSelectedPeople(value)}
        class={(slot) => ({ invalid: slot.invalid, open: slot.open })}
      >
        <Listbox.Button>Choose people</Listbox.Button>
        <Listbox.Options anchor={{ gap: 4, to: "selection end" }}>
          {people.map((option) => (
            <Listbox.Option<"div", Person> value={option}>
              {option.name}
            </Listbox.Option>
          ))}
        </Listbox.Options>
        <Listbox.SelectedOption
          options={people.map((option) => (
            <Listbox.Option<"div", Person> value={option}>
              {option.name}
            </Listbox.Option>
          ))}
        />
      </Listbox>

      <Switch checked={checked()} onChange={setChecked}>
        {(slot) => slot.checked ? "On" : "Off"}
      </Switch>

      <Dialog open={dialogOpen()} onClose={(next) => setDialogOpen(next)}>
        {(slot) => (
          <>
            <Dialog.Panel class={(panel) => ({ open: panel.open })}>
              <Dialog.Title>Controlled dialog</Dialog.Title>
              <Dialog.Description>
                {slot.open ? "Open" : "Closed"}
              </Dialog.Description>
            </Dialog.Panel>
          </>
        )}
      </Dialog>
    </>
  );
}

/** Every audited compatibility static is reachable and typed. */
export function CompoundStaticConsumer(): Element {
  return (
    <>
      <Disclosure>
        <Disclosure.Button>Details</Disclosure.Button>
        <Disclosure.Panel>Content</Disclosure.Panel>
      </Disclosure>
      <FocusTrap features={FocusTrap.features.None}>Trap</FocusTrap>
      <Menu>
        <Menu.Button>Open</Menu.Button>
        <Menu.Items>
          <Menu.Section>
            <Menu.Heading>Actions</Menu.Heading>
            <Menu.Item>Action</Menu.Item>
          </Menu.Section>
          <Menu.Separator />
        </Menu.Items>
      </Menu>
      <Popover>
        <Popover.Button>Open</Popover.Button>
        <Popover.Backdrop />
        <Popover.Overlay />
        <Popover.Panel anchor={{ gap: 4, to: "bottom start" }}>
          Panel
        </Popover.Panel>
      </Popover>
      <Popover.Group>
        <Popover>
          <Popover.Button>Grouped</Popover.Button>
        </Popover>
      </Popover.Group>
      <Portal.Group target={null}>
        <Portal>Portalled</Portal>
      </Portal.Group>
      <RadioGroup value="one" onChange={() => {}}>
        <RadioGroup.Label>Choice</RadioGroup.Label>
        <RadioGroup.Description>Pick one</RadioGroup.Description>
        <RadioGroup.Option value="one">One</RadioGroup.Option>
        <RadioGroup.Radio value="two">Two</RadioGroup.Radio>
      </RadioGroup>
      <Switch.Group>
        <Switch.Label>Setting</Switch.Label>
        <Switch.Description>Description</Switch.Description>
        <Switch />
      </Switch.Group>
      <Tab.Group>
        <Tab.List>
          <Tab>First</Tab>
        </Tab.List>
        <Tab.Panels>
          <Tab.Panel>Panel</Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
      <Transition.Root show>
        <Transition.Child>Visible</Transition.Child>
      </Transition.Root>
    </>
  );
}

/** Named runtime imports are also checked from the same public entry point. */
export const namedRuntimeSurface = {
  Button,
  Checkbox,
  CloseButton,
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxLabel,
  ComboboxOption,
  ComboboxOptions,
  DataInteractive,
  Description,
  Dialog,
  DialogBackdrop,
  DialogDescription,
  DialogPanel,
  DialogTitle,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Field,
  Fieldset,
  FocusTrap,
  FocusTrapFeatures,
  Input,
  Label,
  Legend,
  Listbox,
  ListboxButton,
  ListboxLabel,
  ListboxOption,
  ListboxOptions,
  ListboxSelectedOption,
  Menu,
  MenuButton,
  MenuHeading,
  MenuItem,
  MenuItems,
  MenuSection,
  MenuSeparator,
  Popover,
  PopoverBackdrop,
  PopoverButton,
  PopoverGroup,
  PopoverOverlay,
  PopoverPanel,
  Portal,
  Radio,
  RadioGroup,
  RadioGroupDescription,
  RadioGroupLabel,
  RadioGroupOption,
  Select,
  Switch,
  SwitchDescription,
  SwitchGroup,
  SwitchLabel,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
  Textarea,
  Transition,
  TransitionChild,
  useClose,
} as const;

/** Intentional failures prevent the public types from widening silently. */
export function RejectedConsumerUsages(): Element {
  const person = people[0];

  // @ts-expect-error `by` keys must exist on the selected value type.
  const invalidComboboxComparator = <Combobox<Person> by="missing" />;

  const invalidComboboxMultipleValue = (
    // @ts-expect-error A multi Combobox is controlled by an array, not one item.
    <Combobox<Person, true> multiple value={person} />
  );

  // @ts-expect-error Combobox options always require a value.
  const missingComboboxOptionValue = <ComboboxOption<Person> />;

  // @ts-expect-error `center` is not a supported floating placement.
  const invalidComboboxAnchor = <ComboboxOptions anchor="center" />;

  const invalidListboxMultipleValue = (
    // @ts-expect-error Explicit multi Listbox values must be arrays.
    <Listbox<"div", Person[], Person> multiple value={person} />
  );

  const invalidListboxComparator = (
    // @ts-expect-error `by` keys must exist on the Listbox item type.
    <Listbox<"div", Person, Person> by="missing" value={person} />
  );

  const missingCustomAsProp = (
    // @ts-expect-error The custom component's required `to` prop is preserved.
    <Button as={RouterLink}>Missing destination</Button>
  );

  // @ts-expect-error A controlled Dialog requires its close callback.
  const missingDialogClose = <Dialog open />;

  // @ts-expect-error Dialog roles are deliberately limited by the ARIA contract.
  const invalidDialogRole = <Dialog open onClose={() => {}} role="menu" />;

  const invalidEventTarget = (
    <Button<"button">
      onClick={(event) => {
        // @ts-expect-error A native button event does not target an anchor.
        const anchor: HTMLAnchorElement = event.currentTarget;
        void anchor;
      }}
    />
  );

  const invalidButtonRef = (
    // @ts-expect-error Default Button refs receive HTMLButtonElement.
    <Button<"button"> ref={(_element: HTMLAnchorElement) => {}} />
  );

  const invalidSlotProperty = (
    <Checkbox>
      {(slot) => {
        // @ts-expect-error Slot contracts do not have arbitrary properties.
        return slot.missing;
      }}
    </Checkbox>
  );

  return (
    <>
      {invalidComboboxComparator}
      {invalidComboboxMultipleValue}
      {missingComboboxOptionValue}
      {invalidComboboxAnchor}
      {invalidListboxMultipleValue}
      {invalidListboxComparator}
      {missingCustomAsProp}
      {missingDialogClose}
      {invalidDialogRole}
      {invalidEventTarget}
      {invalidButtonRef}
      {invalidSlotProperty}
    </>
  );
}

// React never exposed this compound member; the named component is canonical.
// @ts-expect-error Use the `DialogBackdrop` named export.
export const unsupportedDialogBackdropStatic = Dialog.Backdrop;
