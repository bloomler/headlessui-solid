import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  type Element,
  omit,
  onSettled,
  Show,
  untrack,
  useContext,
} from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import {
  createActivePress,
  createFocusRing,
  createHover,
} from "../../primitives/interactions.ts";
import type { Props, Ref } from "../../types.ts";
import {
  Focus,
  focusIn,
  FocusResult,
  sortByDomNode,
} from "../../utils/focus-management.ts";
import type { AnyProps } from "../../utils/merge-event-props.ts";
import { microTask } from "../../utils/micro-task.ts";
import { isActiveElement } from "../../utils/owner.ts";
import {
  mergeEventProps,
  type PropsForFeatures,
  renderElement,
  RenderFeatures,
} from "../../utils/render.tsx";
import {
  resolveReorderedTabIndex,
  resolveTabFocusIntent,
  resolveTabSelectionIndex,
  type TabsOrientation,
} from "./tabs-machine.ts";

export type { TabsOrientation } from "./tabs-machine.ts";

type TabsActivation = "auto" | "manual";

interface RegisteredTab {
  readonly disabled: Accessor<boolean>;
  readonly element: Accessor<HTMLElement | null>;
  readonly id: Accessor<string>;
}

interface RegisteredPanel {
  readonly element: Accessor<HTMLElement | null>;
  readonly id: Accessor<string>;
}

interface TabsData {
  readonly activation: Accessor<TabsActivation>;
  readonly orientation: Accessor<TabsOrientation>;
  readonly panels: Accessor<readonly RegisteredPanel[]>;
  readonly selectedIndex: Accessor<number>;
  readonly tabs: Accessor<readonly RegisteredTab[]>;
}

interface TabsActions {
  change(index: number): void;
  reconcileOrder(): void;
  registerPanel(panel: RegisteredPanel): () => void;
  registerTab(tab: RegisteredTab): () => void;
}

const TabsDataContext = createContext<TabsData>();
const TabsActionsContext = createContext<TabsActions>();

type StableCollectionGroup = Map<string, number>;

interface TabsStableCollection {
  get(group: string, key: string): readonly [number, () => void];
}

function createTabsStableCollection(): TabsStableCollection {
  const groups = new Map<string, StableCollectionGroup>();

  return {
    get(group, key) {
      let list = groups.get(group);
      if (!list) {
        list = new Map();
        groups.set(group, list);
      }

      list.set(key, (list.get(key) ?? 0) + 1);
      const index = Array.from(list.keys()).indexOf(key);
      let active = true;

      return [index, () => {
        if (!active) return;
        active = false;
        const renders = list.get(key);
        if (renders === undefined) return;
        if (renders > 1) list.set(key, renders - 1);
        else list.delete(key);
      }] as const;
    },
  };
}

const TabsStableCollectionContext = createContext<TabsStableCollection>();

function useTabsStableCollectionIndex(group: "tabs" | "panels"): number {
  const collection = useContext(TabsStableCollectionContext);
  const key = createUniqueId();
  const [index, release] = collection.get(group, key);
  onSettled(() => () => release());
  return index;
}

const DEFAULT_TABS_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the tab group component.
 */
export type TabGroupRenderPropArg = Readonly<{
  selectedIndex: number;
}>;

/**
 * Props accepted by the tab group component.
 */
export type TabGroupProps<
  TTag extends ValidComponent = typeof DEFAULT_TABS_TAG,
> = Props<
  TTag,
  TabGroupRenderPropArg,
  never,
  {
    defaultIndex?: number;
    manual?: boolean;
    onChange?: (index: number) => void;
    selectedIndex?: number;
    vertical?: boolean;
  },
  HTMLElement
>;

/**
 * Renders the group for the tab component family.
 */
export function TabGroup<
  TTag extends ValidComponent = typeof DEFAULT_TABS_TAG,
>(props: TabGroupProps<TTag>): Element {
  const initialDefaultIndex = untrack(() => props.defaultIndex ?? 0);
  const initialSelectedIndex = untrack(() =>
    props.selectedIndex ?? initialDefaultIndex
  );
  const [selectedIndex, setSelectedIndex] = createSignal(
    initialSelectedIndex,
    { ownedWrite: true },
  );
  const [registryVersion, setRegistryVersion] = createSignal(0, {
    ownedWrite: true,
  });
  const [groupElement, setGroupElement] = createSignal<HTMLElement | null>(
    null,
    { ownedWrite: true },
  );
  const stableCollection = createTabsStableCollection();

  let selectedIndexValue = initialSelectedIndex;
  let selectedTabId: string | undefined;
  let registeredTabs: RegisteredTab[] = [];
  let registeredPanels: RegisteredPanel[] = [];
  let normalizationScheduled = false;
  let disposed = false;

  const isControlled = () => props.selectedIndex !== undefined;
  const orientation = (): TabsOrientation =>
    props.vertical ? "vertical" : "horizontal";
  const activation = (): TabsActivation => props.manual ? "manual" : "auto";
  const tabs = (): readonly RegisteredTab[] => {
    registryVersion();
    return sortByDomNode(registeredTabs, (tab) => tab.element());
  };
  const panels = (): readonly RegisteredPanel[] => {
    registryVersion();
    return sortByDomNode(registeredPanels, (panel) => panel.element());
  };
  const tabIdentity = (tab: RegisteredTab | undefined): string | undefined =>
    tab?.element()?.id || tab?.id();

  const commitSelectedIndex = (index: number): void => {
    selectedIndexValue = index;
    setSelectedIndex(index);
  };

  const applySelectedIndexSnapshot = (
    requestedIndex: number,
    tabStates: readonly { disabled: boolean }[],
  ): void => {
    const nextIndex = resolveTabSelectionIndex(
      selectedIndexValue,
      requestedIndex,
      tabStates,
    );
    if (nextIndex !== selectedIndexValue) commitSelectedIndex(nextIndex);
  };
  const applySelectedIndex = (requestedIndex: number): void => {
    applySelectedIndexSnapshot(
      requestedIndex,
      tabs().map((tab) => ({ disabled: tab.disabled() })),
    );
  };

  const scheduleNormalization = (): void => {
    if (normalizationScheduled) return;
    normalizationScheduled = true;
    microTask(() => {
      normalizationScheduled = false;
      if (disposed) return;
      if (!isControlled() && selectedTabId !== undefined) {
        const orderedTabs = tabs();
        const identityIndex = orderedTabs.findIndex((tab) =>
          tabIdentity(tab) === selectedTabId
        );
        // Identity preservation must not pin the initial selection to a
        // disabled default. Disabled-tab normalization has priority, matching
        // the upstream SetSelectedIndex reducer.
        if (identityIndex !== -1 && !orderedTabs[identityIndex].disabled()) {
          commitSelectedIndex(identityIndex);
          return;
        }
      }
      const requestedIndex = isControlled()
        ? props.selectedIndex as number
        : selectedIndexValue;
      applySelectedIndex(requestedIndex);
      if (!isControlled()) {
        selectedTabId = tabIdentity(tabs()[selectedIndexValue]);
      }
    });
  };

  const change = (index: number): void => {
    const currentIndex = isControlled()
      ? props.selectedIndex as number
      : selectedIndexValue;
    if (currentIndex !== index) props.onChange?.(index);
    if (!isControlled()) {
      selectedTabId = tabIdentity(tabs()[index]) ?? selectedTabId;
      applySelectedIndex(index);
    }
  };

  const registerTab = (tab: RegisteredTab): () => void => {
    if (registeredTabs.includes(tab)) return () => {};

    const previousOrder = tabs();
    const currentIndex = isControlled()
      ? props.selectedIndex as number
      : selectedIndexValue;
    const activeTab = previousOrder[currentIndex];
    registeredTabs = sortByDomNode(
      [...registeredTabs, tab],
      (item) => item.element(),
    );

    if (!isControlled() && selectedTabId === undefined) {
      selectedTabId = tabIdentity(registeredTabs[currentIndex]);
    }

    if (!isControlled() && activeTab) {
      const nextIndex = registeredTabs.indexOf(activeTab);
      if (nextIndex !== -1) commitSelectedIndex(nextIndex);
    }

    setRegistryVersion((version) => version + 1);
    scheduleNormalization();

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      registeredTabs = registeredTabs.filter((item) => item !== tab);
      setRegistryVersion((version) => version + 1);
      scheduleNormalization();
    };
  };

  const registerPanel = (panel: RegisteredPanel): () => void => {
    if (registeredPanels.includes(panel)) return () => {};
    registeredPanels = sortByDomNode(
      [...registeredPanels, panel],
      (item) => item.element(),
    );
    setRegistryVersion((version) => version + 1);

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      registeredPanels = registeredPanels.filter((item) => item !== panel);
      setRegistryVersion((version) => version + 1);
    };
  };

  const reconcileOrder = (): void => {
    const previousTabs = registeredTabs;
    const nextTabs = sortByDomNode(previousTabs, (tab) => tab.element());
    const tabsChanged = nextTabs.some((tab, index) =>
      previousTabs[index] !== tab
    );

    const currentIndex = isControlled()
      ? props.selectedIndex as number
      : selectedIndexValue;
    const idIndex = !isControlled() && selectedTabId !== undefined
      ? nextTabs.findIndex((tab) => tabIdentity(tab) === selectedTabId)
      : -1;
    const nextIndex = idIndex === -1
      ? resolveReorderedTabIndex(previousTabs, nextTabs, currentIndex)
      : idIndex;

    if (tabsChanged) {
      registeredTabs = nextTabs;
      setRegistryVersion((version) => version + 1);
    }
    if (nextIndex !== currentIndex) change(nextIndex);

    const previousPanels = registeredPanels;
    const nextPanels = sortByDomNode(
      previousPanels,
      (panel) => panel.element(),
    );
    if (nextPanels.some((panel, index) => previousPanels[index] !== panel)) {
      registeredPanels = nextPanels;
      setRegistryVersion((version) => version + 1);
    }
  };

  const actions: TabsActions = {
    change,
    reconcileOrder,
    registerPanel,
    registerTab,
  };
  const data: TabsData = {
    activation,
    orientation,
    panels,
    selectedIndex,
    tabs,
  };

  createEffect(
    () => {
      const requestedIndex = props.selectedIndex;
      if (requestedIndex === undefined) return;
      return {
        requestedIndex,
        tabStates: tabs().map((tab) => ({ disabled: tab.disabled() })),
      };
    },
    (snapshot) => {
      if (snapshot !== undefined) {
        applySelectedIndexSnapshot(
          snapshot.requestedIndex,
          snapshot.tabStates,
        );
      }
    },
  );

  createEffect(
    groupElement,
    (element) => {
      if (element === null || typeof MutationObserver === "undefined") return;
      const observer = new MutationObserver(reconcileOrder);
      observer.observe(element, { childList: true, subtree: true });
      return () => observer.disconnect();
    },
  );

  onSettled(() => () => {
    disposed = true;
  });

  const slot: TabGroupRenderPropArg = {
    get selectedIndex() {
      return selectedIndex();
    },
  };
  const theirProps = omit(
    props,
    "defaultIndex",
    "manual",
    "onChange",
    "ref",
    "selectedIndex",
    "vertical",
  ) as AnyProps;
  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return [props.ref as Ref<HTMLElement>, setGroupElement];
    },
  };

  return (
    <TabsStableCollectionContext value={stableCollection}>
      <TabsActionsContext value={actions}>
        <TabsDataContext value={data}>
          {renderElement({
            defaultTag: DEFAULT_TABS_TAG,
            name: "Tabs",
            ourProps,
            slot,
            theirProps,
          })}
        </TabsDataContext>
      </TabsActionsContext>
    </TabsStableCollectionContext>
  );
}

const DEFAULT_LIST_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the tab list component.
 */
export type TabListRenderPropArg = Readonly<{
  selectedIndex: number;
}>;

type TabListPropsWeControl = "aria-orientation" | "role";

/**
 * Props accepted by the tab list component.
 */
export type TabListProps<
  TTag extends ValidComponent = typeof DEFAULT_LIST_TAG,
> = Props<
  TTag,
  TabListRenderPropArg,
  TabListPropsWeControl,
  Record<never, never>,
  HTMLElement
>;

/**
 * Renders the list for the tab component family.
 */
export function TabList<
  TTag extends ValidComponent = typeof DEFAULT_LIST_TAG,
>(props: TabListProps<TTag>): Element {
  const data = useContext(TabsDataContext);
  const actions = useContext(TabsActionsContext);
  const [element, setElement] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });

  // Observe the collection at the boundary whose children actually move.
  // A Tabs root can be polymorphic (or transparent), so relying only on an
  // observer attached to the group wrapper can miss keyed DOM moves. Keeping
  // this observer on the tablist also avoids coupling identity reconciliation
  // to unrelated panel mutations.
  createEffect(
    element,
    (list) => {
      if (list === null || typeof MutationObserver === "undefined") return;
      const observer = new MutationObserver(actions.reconcileOrder);
      observer.observe(list, {
        attributeFilter: ["id"],
        attributes: true,
        childList: true,
        subtree: true,
      });
      return () => observer.disconnect();
    },
  );

  const slot: TabListRenderPropArg = {
    get selectedIndex() {
      return data.selectedIndex();
    },
  };
  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return [props.ref as Ref<HTMLElement>, setElement];
    },
    role: "tablist",
    get "aria-orientation"() {
      return data.orientation();
    },
  };

  return renderElement({
    defaultTag: DEFAULT_LIST_TAG,
    name: "Tabs.List",
    ourProps,
    slot,
    theirProps: omit(props, "ref") as AnyProps,
  });
}

const DEFAULT_TAB_TAG = "button" as const;

/**
 * Reactive state exposed to render-prop children of the tab component.
 */
export type TabRenderPropArg = Readonly<{
  active: boolean;
  autofocus: boolean;
  disabled: boolean;
  focus: boolean;
  hover: boolean;
  selected: boolean;
}>;

type TabPropsWeControl =
  | "aria-controls"
  | "aria-selected"
  | "role"
  | "tabindex";

/**
 * Props accepted by the tab component.
 */
export type TabProps<
  TTag extends ValidComponent = typeof DEFAULT_TAB_TAG,
> = Props<
  TTag,
  TabRenderPropArg,
  TabPropsWeControl,
  {
    autofocus?: boolean;
    disabled?: boolean;
    id?: string;
    type?: "button" | "reset" | "submit";
  },
  HTMLElement
>;

function TabRoot<
  TTag extends ValidComponent = typeof DEFAULT_TAB_TAG,
>(props: TabProps<TTag>): Element {
  const data = useContext(TabsDataContext);
  const actions = useContext(TabsActionsContext);
  const generatedId = `headlessui-tabs-tab-${createUniqueId()}`;
  const ssrIndex = useTabsStableCollectionIndex("tabs");
  const [element, setElement] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });

  const bindElement = (next: HTMLElement): void => {
    setElement(next);

    // Solid collapses getter-backed props at a custom component boundary. The
    // element is not known until that component forwards its ref, so resolve
    // the native default at the DOM boundary as well as in the prop getter.
    if (
      props.type === undefined && next.tagName === "BUTTON" &&
      !next.hasAttribute("type")
    ) {
      next.setAttribute("type", "button");
    }
  };

  const id = () => props.id ?? generatedId;
  const disabled = () => Boolean(props.disabled);
  const autofocus = () => Boolean(props.autofocus);
  const record: RegisteredTab = { disabled, element, id };
  const index = (): number => {
    const registeredIndex = data.tabs().indexOf(record);
    return registeredIndex === -1 ? ssrIndex : registeredIndex;
  };
  const selected = () => index() === data.selectedIndex();

  onSettled(() => actions.registerTab(record));

  const activateUsing = (focus: () => FocusResult): FocusResult => {
    const result = focus();
    if (result === FocusResult.Success && data.activation() === "auto") {
      const activeIndex = data.tabs().findIndex((tab) =>
        isActiveElement(tab.element())
      );
      if (activeIndex !== -1) actions.change(activeIndex);
    }
    return result;
  };

  const handleKeyDown = (
    event: KeyboardEvent & { currentTarget: HTMLElement },
  ): void => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      actions.change(index());
      return;
    }

    const intent = resolveTabFocusIntent(data.orientation(), event.key);
    if (intent === null) return;

    event.preventDefault();
    event.stopPropagation();
    const list = data.tabs()
      .filter((tab) => !tab.disabled())
      .map((tab) => tab.element())
      .filter((tab): tab is HTMLElement => tab !== null);
    const focus = intent === "first"
      ? Focus.First
      : intent === "last"
      ? Focus.Last
      : intent === "previous"
      ? Focus.Previous | Focus.WrapAround
      : Focus.Next | Focus.WrapAround;
    activateUsing(() => focusIn(list, focus));
  };

  let ready = false;
  const handleSelection = (): void => {
    if (ready || disabled()) return;
    ready = true;
    element()?.focus({ preventScroll: true });
    actions.change(index());
    microTask(() => {
      ready = false;
    });
  };

  const handleMouseDown = (event: MouseEvent): void => {
    event.preventDefault();
  };

  const focusRing = createFocusRing({ disabled, focusVisibleOnly: true });
  const hover = createHover({ disabled });
  const activePress = createActivePress({ disabled });
  const slot: TabRenderPropArg = {
    get active() {
      return activePress.pressed();
    },
    get autofocus() {
      return autofocus();
    },
    get disabled() {
      return disabled();
    },
    get focus() {
      return focusRing.focused();
    },
    get hover() {
      return hover.hovered();
    },
    get selected() {
      return selected();
    },
  };
  const theirProps = omit(
    props,
    "autofocus",
    "disabled",
    "id",
    "ref",
    "type",
  ) as AnyProps;
  const ourProps = mergeEventProps(
    {
      get ref(): Ref<HTMLElement> {
        return [props.ref as Ref<HTMLElement>, bindElement];
      },
      get id() {
        return id();
      },
      role: "tab",
      get type() {
        if (props.type) return props.type;
        const tag = props.as ?? DEFAULT_TAB_TAG;
        if (typeof tag === "string" && tag.toLowerCase() === "button") {
          return "button";
        }
        const resolved = element();
        return resolved?.tagName === "BUTTON" &&
            !resolved.hasAttribute("type")
          ? "button"
          : undefined;
      },
      get "aria-controls"() {
        return data.panels()[index()]?.id();
      },
      get "aria-selected"() {
        return selected() ? "true" : "false";
      },
      get tabindex() {
        return selected() ? 0 : -1;
      },
      get disabled() {
        return disabled() || undefined;
      },
      get autofocus() {
        return autofocus() || undefined;
      },
      get "data-autofocus"() {
        return autofocus() ? "" : undefined;
      },
      get onKeyDown() {
        return disabled() ? undefined : handleKeyDown;
      },
      get onMouseDown() {
        return disabled() ? undefined : handleMouseDown;
      },
      get onClick() {
        return disabled() ? undefined : handleSelection;
      },
    },
    focusRing.focusProps,
    hover.hoverProps,
    activePress.pressProps,
  );

  return renderElement({
    defaultTag: DEFAULT_TAB_TAG,
    name: "Tabs.Tab",
    ourProps,
    slot,
    stateKeys: [
      "active",
      "autofocus",
      "disabled",
      "focus",
      "hover",
      "selected",
    ],
    theirProps,
  });
}

const DEFAULT_PANELS_TAG = "div" as const;

/**
 * Reactive state exposed to render-prop children of the tab panels component.
 */
export type TabPanelsRenderPropArg = Readonly<{
  selectedIndex: number;
}>;

/**
 * Props accepted by the tab panels component.
 */
export type TabPanelsProps<
  TTag extends ValidComponent = typeof DEFAULT_PANELS_TAG,
> = Props<
  TTag,
  TabPanelsRenderPropArg,
  never,
  Record<never, never>,
  HTMLElement
>;

/**
 * Renders the panels for the tab component family.
 */
export function TabPanels<
  TTag extends ValidComponent = typeof DEFAULT_PANELS_TAG,
>(props: TabPanelsProps<TTag>): Element {
  const data = useContext(TabsDataContext);
  const slot: TabPanelsRenderPropArg = {
    get selectedIndex() {
      return data.selectedIndex();
    },
  };
  const ourProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return props.ref as Ref<HTMLElement>;
    },
  };

  return renderElement({
    defaultTag: DEFAULT_PANELS_TAG,
    name: "Tabs.Panels",
    ourProps,
    slot,
    theirProps: omit(props, "ref") as AnyProps,
  });
}

const DEFAULT_PANEL_TAG = "div" as const;
const PANEL_RENDER_FEATURES = RenderFeatures.RenderStrategy |
  RenderFeatures.Static;

/**
 * Reactive state exposed to render-prop children of the tab panel component.
 */
export type TabPanelRenderPropArg = Readonly<{
  focus: boolean;
  selected: boolean;
}>;

type TabPanelPropsWeControl = "aria-labelledby" | "role" | "tabindex";

/**
 * Props accepted by the tab panel component.
 */
export type TabPanelProps<
  TTag extends ValidComponent = typeof DEFAULT_PANEL_TAG,
> = Props<
  TTag,
  TabPanelRenderPropArg,
  TabPanelPropsWeControl,
  & PropsForFeatures<typeof PANEL_RENDER_FEATURES>
  & {
    id?: string;
    tabindex?: number;
  },
  HTMLElement
>;

/**
 * Renders the panel for the tab component family.
 */
export function TabPanel<
  TTag extends ValidComponent = typeof DEFAULT_PANEL_TAG,
>(props: TabPanelProps<TTag>): Element {
  const data = useContext(TabsDataContext);
  const actions = useContext(TabsActionsContext);
  const generatedId = `headlessui-tabs-panel-${createUniqueId()}`;
  const ssrIndex = useTabsStableCollectionIndex("panels");
  const [actualElement, setActualElement] = createSignal<HTMLElement | null>(
    null,
    { ownedWrite: true },
  );
  const [placeholderElement, setPlaceholderElement] = createSignal<
    HTMLElement | null
  >(null, {
    ownedWrite: true,
  });

  // Both branches are stable Solid nodes. Once selection swaps branches, a
  // single shared ref can keep pointing at the detached node whose ref ran
  // last. Always resolve the branch that currently participates in DOM order.
  const element = (): HTMLElement | null => {
    const actual = actualElement();
    const placeholder = placeholderElement();
    if (actual?.isConnected) return actual;
    if (placeholder?.isConnected) return placeholder;
    return actual ?? placeholder;
  };

  const id = () => props.id ?? generatedId;
  const record: RegisteredPanel = { element, id };
  const index = (): number => {
    const registeredIndex = data.panels().indexOf(record);
    return registeredIndex === -1 ? ssrIndex : registeredIndex;
  };
  const selected = () => index() === data.selectedIndex();

  onSettled(() => actions.registerPanel(record));

  const focusRing = createFocusRing({ focusVisibleOnly: true });
  const slot: TabPanelRenderPropArg = {
    get focus() {
      return focusRing.focused();
    },
    get selected() {
      return selected();
    },
  };
  const ourProps = mergeEventProps(
    {
      get ref(): Ref<HTMLElement> {
        return [props.ref as Ref<HTMLElement>, setActualElement];
      },
      get id() {
        return id();
      },
      role: "tabpanel",
      get "aria-labelledby"() {
        return data.tabs()[index()]?.id();
      },
      get tabindex() {
        return selected() ? props.tabindex ?? 0 : -1;
      },
    },
    focusRing.focusProps,
  );
  const placeholderProps: AnyProps = {
    get ref(): Ref<HTMLElement> {
      return [props.ref as Ref<HTMLElement>, setPlaceholderElement];
    },
    get id() {
      return id();
    },
    role: "tabpanel",
    "aria-hidden": "true",
    get "aria-labelledby"() {
      return data.tabs()[index()]?.id();
    },
    tabindex: -1,
    style: {
      position: "fixed",
      top: "1px",
      left: "1px",
      width: "1px",
      height: "0",
      padding: "0",
      margin: "-1px",
      overflow: "hidden",
      clip: "rect(0, 0, 0, 0)",
      "white-space": "nowrap",
      "border-width": "0",
    },
  };
  const shouldRenderPlaceholder = () =>
    !selected() && (props.unmount ?? true) && !(props.static ?? false);
  const actual = renderElement({
    defaultTag: DEFAULT_PANEL_TAG,
    features: PANEL_RENDER_FEATURES,
    name: "Tabs.Panel",
    ourProps,
    slot,
    stateKeys: ["focus", "selected"],
    theirProps: omit(props, "id", "ref", "tabindex") as AnyProps,
    // Static panels are present regardless of selection. The shared render
    // strategy still handles persistent (`unmount={false}`) hidden panels.
    visible: () => selected() || props.static === true,
  });
  const placeholder = renderElement({
    defaultTag: "span",
    name: "Tabs.Panel",
    ourProps: placeholderProps,
    slot: {},
    theirProps: {},
  });

  return (
    <Show when={shouldRenderPlaceholder()} fallback={actual}>
      {placeholder}
    </Show>
  );
}

/**
 * Renders the accessible, unstyled tab component for Solid.
 */
export const Tab: typeof TabRoot & {
  Group: typeof TabGroup;
  List: typeof TabList;
  Panel: typeof TabPanel;
  Panels: typeof TabPanels;
} = Object.assign(TabRoot, {
  /** @deprecated Use `<TabGroup>` instead of `<Tab.Group>`. */
  Group: TabGroup,
  /** @deprecated Use `<TabList>` instead of `<Tab.List>`. */
  List: TabList,
  /** @deprecated Use `<TabPanels>` instead of `<Tab.Panels>`. */
  Panels: TabPanels,
  /** @deprecated Use `<TabPanel>` instead of `<Tab.Panel>`. */
  Panel: TabPanel,
});
