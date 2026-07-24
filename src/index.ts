/**
 * Accessible, unstyled UI components for SolidJS 2.
 *
 * This package is an unofficial, community-maintained SolidJS port of
 * Headless UI 2.2.10. Components use Solid-native reactivity, events, SSR,
 * and hydration.
 *
 * @example Create an accessible menu.
 * ```tsx
 * import {
 *   Menu,
 *   MenuButton,
 *   MenuItem,
 *   MenuItems,
 * } from "jsr:@bloomler/headlessui-solid";
 *
 * export function AccountMenu() {
 *   return (
 *     <Menu>
 *       <MenuButton>Account</MenuButton>
 *       <MenuItems>
 *         <MenuItem as="a" href="/profile">Profile</MenuItem>
 *       </MenuItems>
 *     </Menu>
 *   );
 * }
 * ```
 *
 * @module
 */

export {
  Button,
  type ButtonProps,
  type ButtonRenderPropArg,
} from "./components/button/button.tsx";
export {
  Checkbox,
  type CheckboxProps,
  type CheckboxRenderPropArg,
} from "./components/checkbox/checkbox.tsx";
export {
  CloseButton,
  type CloseButtonProps,
} from "./components/close-button/close-button.tsx";
export {
  Combobox,
  type ComboboxAnchor,
  type ComboboxAnchorConfig,
  type ComboboxAnchorTo,
  ComboboxButton,
  type ComboboxButtonProps,
  type ComboboxButtonRenderPropArg,
  ComboboxInput,
  type ComboboxInputChangeEvent,
  type ComboboxInputProps,
  type ComboboxInputRenderPropArg,
  ComboboxLabel,
  type ComboboxLabelProps,
  type ComboboxLabelRenderPropArg,
  ComboboxOption,
  type ComboboxOptionProps,
  type ComboboxOptionRenderPropArg,
  ComboboxOptions,
  type ComboboxOptionsProps,
  type ComboboxOptionsRenderPropArg,
  type ComboboxProps,
  type ComboboxRenderPropArg,
  type EnsureArray,
} from "./components/combobox/combobox.tsx";
export {
  DataInteractive,
  type DataInteractiveProps,
  type DataInteractiveRenderPropArg,
} from "./components/data-interactive/data-interactive.tsx";
export {
  Description,
  type DescriptionProps,
} from "./components/description/description.tsx";
export {
  Dialog,
  DialogBackdrop,
  type DialogBackdropProps,
  type DialogBackdropRenderPropArg,
  DialogDescription,
  DialogPanel,
  type DialogPanelProps,
  type DialogPanelRenderPropArg,
  type DialogProps,
  type DialogRenderPropArg,
  DialogTitle,
  type DialogTitleProps,
  type DialogTitleRenderPropArg,
} from "./components/dialog/dialog.tsx";
export {
  Disclosure,
  DisclosureButton,
  type DisclosureButtonProps,
  type DisclosureButtonRenderPropArg,
  type DisclosureCloseTarget,
  DisclosurePanel,
  type DisclosurePanelProps,
  type DisclosurePanelRenderPropArg,
  type DisclosureProps,
  type DisclosureRenderPropArg,
} from "./components/disclosure/disclosure.tsx";
export {
  Field,
  type FieldProps,
  type FieldRenderPropArg,
} from "./components/field/field.tsx";
export {
  Fieldset,
  type FieldsetProps,
  type FieldsetRenderPropArg,
} from "./components/fieldset/fieldset.tsx";
export {
  FocusTrap,
  type FocusTrapContainers,
  type FocusTrapElementReference,
  FocusTrapFeatures,
  type FocusTrapProps,
} from "./components/focus-trap/focus-trap.tsx";
export {
  Input,
  type InputProps,
  type InputRenderPropArg,
} from "./components/input/input.tsx";
export { Label, type LabelProps } from "./components/label/label.tsx";
export { Legend, type LegendProps } from "./components/legend/legend.tsx";
export {
  Listbox,
  type ListboxAnchor,
  type ListboxAnchorConfig,
  type ListboxAnchorTo,
  ListboxButton,
  type ListboxButtonProps,
  type ListboxButtonRenderPropArg,
  ListboxLabel,
  type ListboxLabelProps,
  type ListboxLabelRenderPropArg,
  ListboxOption,
  type ListboxOptionProps,
  type ListboxOptionRenderPropArg,
  ListboxOptions,
  type ListboxOptionsProps,
  type ListboxOptionsRenderPropArg,
  type ListboxProps,
  type ListboxRenderPropArg,
  ListboxSelectedOption,
  type ListboxSelectedOptionProps,
  type ListboxSelectedOptionRenderPropArg,
} from "./components/listbox/listbox.tsx";
export {
  Menu,
  type MenuAnchor,
  type MenuAnchorConfig,
  type MenuAnchorTo,
  MenuButton,
  type MenuButtonProps,
  type MenuButtonRenderPropArg,
  MenuHeading,
  type MenuHeadingProps,
  type MenuHeadingRenderPropArg,
  MenuItem,
  type MenuItemProps,
  type MenuItemRenderPropArg,
  MenuItems,
  type MenuItemsProps,
  type MenuItemsRenderPropArg,
  type MenuProps,
  type MenuRenderPropArg,
  MenuSection,
  type MenuSectionProps,
  type MenuSectionRenderPropArg,
  MenuSeparator,
  type MenuSeparatorProps,
  type MenuSeparatorRenderPropArg,
} from "./components/menu/menu.tsx";
export {
  Popover,
  type PopoverAnchor,
  type PopoverAnchorConfig,
  type PopoverAnchorTo,
  PopoverBackdrop,
  type PopoverBackdropProps,
  type PopoverBackdropRenderPropArg,
  PopoverButton,
  type PopoverButtonProps,
  type PopoverButtonRenderPropArg,
  type PopoverCloseTarget,
  PopoverGroup,
  type PopoverGroupProps,
  type PopoverGroupRenderPropArg,
  PopoverOverlay,
  type PopoverOverlayProps,
  PopoverPanel,
  type PopoverPanelProps,
  type PopoverPanelRenderPropArg,
  type PopoverProps,
  type PopoverRenderPropArg,
} from "./components/popover/popover.tsx";
export { Portal, type PortalProps } from "./components/portal/portal.tsx";
export {
  type ByComparator,
  Radio,
  RadioGroup,
  RadioGroupDescription,
  RadioGroupLabel,
  RadioGroupOption,
  type RadioGroupProps,
  type RadioGroupRenderPropArg,
  type RadioOptionProps,
  type RadioOptionRenderPropArg,
  type RadioProps,
  type RadioRenderPropArg,
} from "./components/radio-group/radio-group.tsx";
export {
  Select,
  type SelectProps,
  type SelectRenderPropArg,
} from "./components/select/select.tsx";
export {
  Switch,
  SwitchDescription,
  SwitchGroup,
  type SwitchGroupProps,
  SwitchLabel,
  type SwitchProps,
  type SwitchRenderPropArg,
} from "./components/switch/switch.tsx";
export {
  Tab,
  TabGroup,
  type TabGroupProps,
  type TabGroupRenderPropArg,
  TabList,
  type TabListProps,
  type TabListRenderPropArg,
  TabPanel,
  type TabPanelProps,
  type TabPanelRenderPropArg,
  TabPanels,
  type TabPanelsProps,
  type TabPanelsRenderPropArg,
  type TabProps,
  type TabRenderPropArg,
} from "./components/tabs/tabs.tsx";
export {
  Textarea,
  type TextareaProps,
  type TextareaRenderPropArg,
} from "./components/textarea/textarea.tsx";
export {
  Transition,
  TransitionChild,
  type TransitionChildProps,
  type TransitionChildRenderPropArg,
  type TransitionClasses,
  type TransitionEvents,
  type TransitionRootProps,
} from "./components/transition/transition.tsx";
export { useClose } from "./internal/close-provider.tsx";
export type { ElementType, Expand, Props, PropsOf, Ref } from "./types.ts";
