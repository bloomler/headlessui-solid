import { render } from "@solidjs/web";
import {
  createSignal,
  DEV,
  type Element,
  For,
  onSettled,
  refresh,
  Show,
} from "solid-js";
import {
  Button,
  Checkbox,
  CloseButton,
  Dialog,
  DialogBackdrop,
  DialogDescription,
  DialogPanel,
  DialogTitle,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  FocusTrap,
  FocusTrapFeatures,
  Portal,
  Radio,
  RadioGroup,
  RadioGroupDescription,
  RadioGroupLabel,
  Switch,
  SwitchDescription,
  SwitchGroup,
  SwitchLabel,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "../../src/index.ts";
import { CloseProvider } from "../../src/internal/close-provider.tsx";
import { Hidden, HiddenFeatures } from "../../src/internal/hidden.tsx";
import {
  FloatingProvider,
  useFloatingPanel,
  useFloatingPanelProps,
  useFloatingReference,
} from "../../src/internal/floating.tsx";
import { createInertOthers } from "../../src/primitives/inert-others.ts";
import { createOnDisappear } from "../../src/primitives/on-disappear.ts";
import { createOutsideClick } from "../../src/primitives/outside-click.ts";
import { createRootContainers } from "../../src/primitives/root-containers.tsx";
import { createScrollLock } from "../../src/primitives/scroll-lock.ts";
import { createEscape } from "../../src/primitives/top-layer.ts";

const diagnosticApi = DEV?.diagnostics;
if (!diagnosticApi) {
  throw new Error(
    "Solid DEV diagnostics are unavailable. Build the Brave harness with Solid's browser development export.",
  );
}

const positiveControl = diagnosticApi.capture();
let refreshThrew = false;

try {
  (refresh as unknown as (target: unknown) => void)(null);
} catch {
  refreshThrew = true;
}

const positiveControlEvents = positiveControl.stop();
if (
  !refreshThrew || positiveControlEvents.length !== 1 ||
  positiveControlEvents[0]?.code !== "INVALID_REFRESH_TARGET"
) {
  throw new Error(
    `Solid DEV diagnostic positive control failed: expected exactly INVALID_REFRESH_TARGET, received ${
      JSON.stringify(positiveControlEvents.map((event) => event.code))
    }`,
  );
}

const cleanState = diagnosticApi.capture();
const leakedEvents = cleanState.stop();
if (leakedEvents.length !== 0) {
  throw new Error(
    `Solid DEV diagnostic positive control left events behind: ${
      JSON.stringify(leakedEvents.map((event) => event.code))
    }`,
  );
}

const diagnostics = diagnosticApi.capture();
const browserGlobal = globalThis as typeof globalThis & {
  __disposeHeadlessuiApp: () => void;
  __headlessuiDiagnostics: () => ReadonlyArray<{
    code: string;
    message: string;
    nodeName?: string;
    ownerName?: string;
  }>;
};
browserGlobal.__headlessuiDiagnostics = () =>
  diagnostics.stop().map((event) => ({
    code: event.code,
    message: event.message,
    nodeName: event.nodeName,
    ownerName: event.ownerName,
  }));
const includeBooleanScenarios = new URLSearchParams(location.search).has(
  "boolean",
);
const includeRadioScenarios = new URLSearchParams(location.search).has(
  "radio",
);
const includeDisclosureScenarios = new URLSearchParams(location.search).has(
  "disclosure",
);
const includeKernelScenarios = new URLSearchParams(location.search).has(
  "kernel",
);
const includeTabScenarios = new URLSearchParams(location.search).has("tabs");
const includeFocusTrapScenarios = new URLSearchParams(location.search).has(
  "focus-trap",
);
const includeDialogScenarios = new URLSearchParams(location.search).has(
  "dialog",
);
const includeTouchMobileScenarios = new URLSearchParams(location.search).has(
  "touch-mobile",
);

function EscapeLayer(props: {
  id: string;
  onEscape: (event: KeyboardEvent) => void;
}): Element {
  createEscape(
    () => true,
    () => window,
    (event) => props.onEscape(event),
  );
  return <span id={props.id}>{props.id}</span>;
}

function FloatingKernel(): Element {
  const [placement, setPlacement] = createSignal<
    "bottom start" | "top end"
  >("bottom start");
  const setReference = useFloatingReference();
  const [setFloating, floatingStyles] = useFloatingPanel(() => ({
    gap: 8,
    offset: 4,
    padding: 4,
    to: placement(),
  }));
  const floatingProps = useFloatingPanelProps();

  return (
    <>
      <button
        id="floating-reference"
        ref={setReference}
        type="button"
        style={{
          height: "20px",
          left: "100px",
          "pointer-events": "none",
          position: "fixed",
          top: "100px",
          width: "80px",
        }}
      >
        Anchor
      </button>
      <div
        {...floatingProps}
        id="floating-panel"
        ref={setFloating}
        style={{
          ...floatingStyles(),
          height: "30px",
          "pointer-events": "none",
          width: "60px",
        }}
      >
        Floating panel
      </div>
      <button
        id="flip-floating-placement"
        type="button"
        onClick={() => setPlacement("top end")}
      >
        Move floating panel
      </button>
    </>
  );
}

function LateSettledChild(props: {
  id: string;
  onReady: () => void;
}): Element {
  onSettled(() => {
    props.onReady();
  });
  return <span id={props.id}>Late settled child</span>;
}

function OverlayKernel(): Element {
  const [outsideClicks, setOutsideClicks] = createSignal(0);
  const [portalEnabled, setPortalEnabled] = createSignal(false);
  const [lateSettledChild, setLateSettledChild] = createSignal(false);
  const [lateSettledRuns, setLateSettledRuns] = createSignal(0);
  const [latePortalledChild, setLatePortalledChild] = createSignal(false);
  const [latePortalledSettledRuns, setLatePortalledSettledRuns] = createSignal(
    0,
  );
  const [inert, setInert] = createSignal(false);
  const [scrollLocked, setScrollLocked] = createSignal(false);
  const [disappearEnabled, setDisappearEnabled] = createSignal(false);
  const [disappeared, setDisappeared] = createSignal(0);
  const [rootIds, setRootIds] = createSignal("");
  let container: HTMLElement | undefined;
  let disappearing: HTMLDivElement | undefined;

  createOutsideClick(
    () => true,
    () => [container],
    () => setOutsideClicks((value) => value + 1),
  );
  createInertOthers(inert, {
    allowed: () => [container],
    disallowed: () => [
      document.getElementById("third-party-root") as HTMLElement | null,
    ],
  });
  createScrollLock(
    scrollLocked,
    () => document,
    () => container ? [container] : [],
  );
  createOnDisappear(
    disappearEnabled,
    () => disappearing,
    () => setDisappeared((value) => value + 1),
  );

  const roots = createRootContainers({
    defaultContainers: () => [container ?? null],
    mainTreeNode: () => document.getElementById("app"),
  });

  return (
    <section id="overlay-kernel" ref={container}>
      <button id="inside-target" type="button">Inside target</button>
      <output id="outside-clicks">{outsideClicks()}</output>
      <button
        id="mount-late-settled-child"
        type="button"
        onClick={() => setLateSettledChild(true)}
      >
        Mount late settled child
      </button>
      <Show when={lateSettledChild()}>
        <LateSettledChild
          id="late-settled-child"
          onReady={() => setLateSettledRuns((value) => value + 1)}
        />
      </Show>
      <output id="late-settled-runs">{lateSettledRuns()}</output>
      <button
        id="mount-late-portalled-child"
        type="button"
        onClick={() => setLatePortalledChild(true)}
      >
        Mount late portalled child
      </button>
      <Show when={latePortalledChild()}>
        <Portal>
          <LateSettledChild
            id="late-portalled-child"
            onReady={() => setLatePortalledSettledRuns((value) => value + 1)}
          />
        </Portal>
      </Show>
      <output id="late-portalled-settled-runs">
        {latePortalledSettledRuns()}
      </output>
      <button
        id="toggle-dynamic-portal"
        type="button"
        onClick={() => setPortalEnabled((value) => !value)}
      >
        Toggle dynamic portal
      </button>
      <div id="dynamic-portal-parent">
        <Portal enabled={portalEnabled()}>
          <Show
            when={portalEnabled()}
            fallback={
              <span id="dynamic-portal-content">Inline dynamic portal</span>
            }
          >
            <span id="dynamic-portal-content">Portalled dynamic portal</span>
          </Show>
        </Portal>
      </div>
      <button id="enable-inert" type="button" onClick={() => setInert(true)}>
        Enable inert
      </button>
      <button id="disable-inert" type="button" onClick={() => setInert(false)}>
        Disable inert
      </button>
      <button
        id="enable-scroll-lock"
        type="button"
        onClick={() => setScrollLocked(true)}
      >
        Enable scroll lock
      </button>
      <button
        id="disable-scroll-lock"
        type="button"
        onClick={() => setScrollLocked(false)}
      >
        Disable scroll lock
      </button>
      <button
        id="resolve-roots"
        type="button"
        onClick={() =>
          setRootIds(
            roots.resolveContainers().map((element) => element.id).join(","),
          )}
      >
        Resolve roots
      </button>
      <output id="root-ids">{rootIds()}</output>
      <button
        id="hide-disappear-target"
        type="button"
        onClick={() => setDisappearEnabled(true)}
      >
        Hide observed target
      </button>
      <div
        id="disappear-target"
        ref={disappearing}
        style={{ display: disappearEnabled() ? "none" : "block" }}
      >
        Observed target
      </div>
      <output id="disappeared">{disappeared()}</output>
      <Hidden id="focusable-hidden" features={HiddenFeatures.Focusable}>
        Focus guard
      </Hidden>
      <Hidden id="fully-hidden" features={HiddenFeatures.Hidden}>
        Fully hidden
      </Hidden>
      <FloatingProvider>
        <FloatingKernel />
      </FloatingProvider>
    </section>
  );
}

function TouchMobileScenarios(): Element {
  const [scrollLocked, setScrollLocked] = createSignal(false);
  let allowedContainer: HTMLDivElement | undefined;

  createScrollLock(
    scrollLocked,
    () => document,
    () => allowedContainer ? [allowedContainer] : [],
  );

  return (
    <section id="touch-mobile-scenarios">
      <button
        id="touch-enable-lock"
        type="button"
        onClick={() => setScrollLocked(true)}
      >
        Enable mobile scroll lock
      </button>
      <button
        id="touch-disable-lock"
        type="button"
        onClick={() => setScrollLocked(false)}
      >
        Disable mobile scroll lock
      </button>
      <div
        id="touch-allowed"
        ref={allowedContainer}
        style={{ height: "80px", overflow: "auto", width: "180px" }}
      >
        <button id="touch-allowed-target" type="button">
          Allowed touch target
        </button>
        <div aria-hidden="true" style={{ height: "180px" }} />
      </div>
      <button id="touch-disallowed-target" type="button">
        Disallowed touch target
      </button>
      <a
        id="touch-hash-link"
        href="#touch-hash-target"
        onClick={(event) => event.preventDefault()}
      >
        Restore hash target
      </a>
      <Button id="touch-interaction">Touch interaction probe</Button>
      <div aria-hidden="true" style={{ height: "1600px" }} />
      <div id="touch-hash-target" tabindex={-1}>Hash target</div>
    </section>
  );
}

function TabsScenarios(): Element {
  const [controlledRequest, setControlledRequest] = createSignal(-1);
  const [items, setItems] = createSignal([
    { id: "alpha", label: "Alpha dynamic" },
    { id: "beta", label: "Beta dynamic" },
    { id: "gamma", label: "Gamma dynamic" },
  ]);

  return (
    <>
      <TabGroup>
        <TabList id="auto-tab-list">
          <Tab id="auto-alpha">Alpha tab</Tab>
          <Tab id="auto-beta" disabled>Beta tab</Tab>
          <Tab id="auto-gamma">Gamma tab</Tab>
        </TabList>
        <TabPanels>
          <TabPanel id="auto-alpha-panel">Alpha panel</TabPanel>
          <TabPanel id="auto-beta-panel">Beta panel</TabPanel>
          <TabPanel id="auto-gamma-panel">Gamma panel</TabPanel>
        </TabPanels>
      </TabGroup>

      <TabGroup vertical manual>
        <TabList id="manual-tab-list">
          <Tab id="manual-alpha">Alpha manual</Tab>
          <Tab id="manual-beta" disabled>Beta manual</Tab>
          <Tab id="manual-gamma">Gamma manual</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>Alpha manual panel</TabPanel>
          <TabPanel>Beta manual panel</TabPanel>
          <TabPanel>Gamma manual panel</TabPanel>
        </TabPanels>
      </TabGroup>

      <TabGroup
        selectedIndex={1}
        onChange={(index) => setControlledRequest(index)}
      >
        <TabList>
          <Tab id="controlled-tab-one">Controlled one</Tab>
          <Tab id="controlled-tab-two">Controlled two</Tab>
          <Tab id="controlled-tab-three">Controlled three</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>Controlled panel one</TabPanel>
          <TabPanel>Controlled panel two</TabPanel>
          <TabPanel>Controlled panel three</TabPanel>
        </TabPanels>
      </TabGroup>
      <output id="controlled-tab-request">{controlledRequest()}</output>

      <TabGroup>
        <TabList>
          <Tab>Selected strategy</Tab>
          <Tab>Persistent strategy</Tab>
          <Tab>Static strategy</Tab>
          <Tab>Unmounted strategy</Tab>
        </TabList>
        <TabPanels>
          <TabPanel id="strategy-selected">Selected body</TabPanel>
          <TabPanel id="strategy-persistent" unmount={false}>
            Persistent body
          </TabPanel>
          <TabPanel id="strategy-static" static>Static body</TabPanel>
          <TabPanel id="strategy-unmounted">Unmounted body</TabPanel>
        </TabPanels>
      </TabGroup>

      <button
        id="reverse-dynamic-tabs"
        type="button"
        onClick={() => setItems((current) => current.slice().reverse())}
      >
        Reverse dynamic tabs
      </button>
      <TabGroup>
        {(slot) => (
          <>
            <output id="dynamic-tab-index">{slot.selectedIndex}</output>
            <TabList id="dynamic-tab-list">
              <For each={items()}>
                {(item) => <Tab id={`dynamic-${item.id}`}>{item.label}</Tab>}
              </For>
            </TabList>
            <TabPanels>
              <For each={items()}>
                {(item) => <TabPanel>{item.label} panel</TabPanel>}
              </For>
            </TabPanels>
          </>
        )}
      </TabGroup>
    </>
  );
}

const FULL_FOCUS_TRAP_FEATURES = FocusTrapFeatures.InitialFocus |
  FocusTrapFeatures.AutoFocus |
  FocusTrapFeatures.TabLock |
  FocusTrapFeatures.FocusLock |
  FocusTrapFeatures.RestoreFocus;

function FocusTrapScenarios(): Element {
  const [outerVisible, setOuterVisible] = createSignal(false);
  const [innerVisible, setInnerVisible] = createSignal(false);
  let portalContainer: HTMLDivElement | undefined;

  return (
    <>
      <button
        id="focus-trap-opener"
        type="button"
        onClick={() => setOuterVisible(true)}
      >
        Open focus trap
      </button>
      <button id="focus-trap-outside" type="button">Outside focus trap</button>
      <Show when={outerVisible()}>
        <FocusTrap
          features={FULL_FOCUS_TRAP_FEATURES}
          containers={() => portalContainer ? [portalContainer] : []}
        >
          <button id="focus-trap-first" type="button">First action</button>
          <button id="focus-trap-preferred" type="button" data-autofocus>
            Preferred action
          </button>
          <button
            id="focus-trap-open-inner"
            type="button"
            onClick={() => setInnerVisible(true)}
          >
            Open inner trap
          </button>
          <Portal>
            <div ref={portalContainer}>
              <button id="focus-trap-portal" type="button">
                Portaled focus action
              </button>
            </div>
          </Portal>
          <Show when={innerVisible()}>
            <FocusTrap>
              <button id="focus-trap-inner-first" type="button">
                Inner first
              </button>
              <button
                id="focus-trap-close-inner"
                type="button"
                onClick={() => setInnerVisible(false)}
              >
                Close inner trap
              </button>
            </FocusTrap>
          </Show>
          <button
            id="focus-trap-close"
            type="button"
            onClick={() => setOuterVisible(false)}
          >
            Close focus trap
          </button>
        </FocusTrap>
      </Show>
    </>
  );
}

function DialogScenarios(): Element {
  const [open, setOpen] = createSignal(false);
  const [innerOpen, setInnerOpen] = createSignal(false);
  const [hiddenByLayout, setHiddenByLayout] = createSignal(false);
  const [closeRequests, setCloseRequests] = createSignal(0);
  const [portalClicks, setPortalClicks] = createSignal(0);
  const [persistentMounted, setPersistentMounted] = createSignal(false);
  const [persistentOpen, setPersistentOpen] = createSignal(false);
  const [afterLeave, setAfterLeave] = createSignal(0);

  const openDialog = () => {
    setHiddenByLayout(false);
    setOpen(true);
  };
  const closeDialog = (_next: false) => {
    setOpen(false);
    setCloseRequests((value) => value + 1);
  };

  return (
    <>
      <button id="dialog-opener" type="button" onClick={openDialog}>
        Open dialog
      </button>
      <button id="dialog-outside" type="button">Outside dialog</button>
      <output id="dialog-close-requests">{closeRequests()}</output>
      <output id="dialog-portal-clicks">{portalClicks()}</output>
      <Show when={open()}>
        <Dialog
          id="dialog-root"
          as="article"
          open
          static
          onClose={closeDialog}
          style={{ display: hiddenByLayout() ? "none" : undefined }}
        >
          <DialogBackdrop
            id="dialog-backdrop"
            style={{ inset: "0", position: "fixed" }}
          />
          <DialogPanel id="dialog-panel">
            <DialogTitle id="dialog-title">Solid dialog</DialogTitle>
            <DialogDescription id="dialog-description">
              Dialog behavior fixture
            </DialogDescription>
            <button id="dialog-first" type="button" data-autofocus>
              First dialog action
            </button>
            <button
              id="dialog-open-inner"
              type="button"
              onClick={() => setInnerOpen(true)}
            >
              Open inner dialog
            </button>
            <Portal>
              <button
                id="dialog-portal"
                type="button"
                onClick={() => setPortalClicks((value) => value + 1)}
              >
                Dialog portal action
              </button>
            </Portal>
            <button
              id="dialog-disappear"
              type="button"
              onClick={() => setHiddenByLayout(true)}
            >
              Hide dialog layout
            </button>
            <Show when={innerOpen()}>
              <Dialog open onClose={() => setInnerOpen(false)}>
                <DialogPanel id="dialog-inner-panel">
                  <button
                    id="dialog-inner-first"
                    type="button"
                    data-autofocus
                  >
                    Inner first
                  </button>
                  <button
                    id="dialog-inner-close"
                    type="button"
                    onClick={() => setInnerOpen(false)}
                  >
                    Close inner dialog
                  </button>
                </DialogPanel>
              </Dialog>
            </Show>
          </DialogPanel>
        </Dialog>
      </Show>

      <button
        id="persistent-dialog-opener"
        type="button"
        onClick={() => {
          setPersistentMounted(true);
          setPersistentOpen(true);
        }}
      >
        Open retained dialog
      </button>
      <Show when={persistentMounted()}>
        <Dialog
          id="persistent-dialog"
          as="article"
          open={persistentOpen()}
          onClose={() => setPersistentOpen(false)}
          transition
          unmount={false}
          afterLeave={() => setAfterLeave((value) => value + 1)}
        >
          <DialogPanel id="persistent-dialog-panel" transition>
            <button
              data-autofocus
              id="persistent-dialog-close"
              type="button"
              onClick={() => setPersistentOpen(false)}
            >
              Close retained dialog
            </button>
          </DialogPanel>
        </Dialog>
      </Show>
      <output id="dialog-after-leave">{afterLeave()}</output>
    </>
  );
}

function App() {
  const [disabled, setDisabled] = createSignal(false);
  const [clicks, setClicks] = createSignal(0);
  const [closes, setCloses] = createSignal(0);
  const [closeClicks, setCloseClicks] = createSignal(0);
  const [checkboxValue, setCheckboxValue] = createSignal("initial");
  const [checkboxSubmits, setCheckboxSubmits] = createSignal(0);
  const [switchChecked, setSwitchChecked] = createSignal(false);
  const [switchChanges, setSwitchChanges] = createSignal(0);
  const [controlledRequest, setControlledRequest] = createSignal("none");
  const [radioChanges, setRadioChanges] = createSignal(0);
  const [radioSubmits, setRadioSubmits] = createSignal(0);
  const [disclosureDefault, setDisclosureDefault] = createSignal(false);
  const [disclosureClicks, setDisclosureClicks] = createSignal(0);
  const [outerEscapes, setOuterEscapes] = createSignal(0);
  const [innerEscapes, setInnerEscapes] = createSignal(0);
  const [showInnerLayer, setShowInnerLayer] = createSignal(true);
  let checkboxForm: HTMLFormElement | undefined;

  return (
    <>
      <Button
        id="subject"
        disabled={disabled()}
        onClick={() => setClicks((value) => value + 1)}
      >
        {(slot) => slot.disabled ? "Unavailable" : "Ready"}
      </Button>
      <button id="disable" type="button" onClick={() => setDisabled(true)}>
        Disable
      </button>
      <output id="clicks">{clicks()}</output>
      <Button id="profile" as="a" href="#profile">Profile</Button>
      <Portal>
        <span id="portaled">Portaled</span>
      </Portal>
      <CloseProvider value={() => setCloses((value) => value + 1)}>
        <CloseButton
          id="close-trigger"
          onClick={() => setCloseClicks((value) => value + 1)}
        >
          Close panel
        </CloseButton>
      </CloseProvider>
      <output id="closes">{closes()}</output>
      <output id="close-clicks">{closeClicks()}</output>
      {includeBooleanScenarios && (
        <>
          <form
            id="checkbox-form"
            ref={checkboxForm}
            onSubmit={(event) => {
              event.preventDefault();
              setCheckboxSubmits((value) => value + 1);
            }}
          >
            <Checkbox
              id="browser-checkbox"
              defaultChecked
              name="terms"
              value="accepted"
              onChange={() => {
                setCheckboxValue(
                  String(new FormData(checkboxForm).get("terms")),
                );
              }}
            >
              {(slot) => slot.checked ? "Accepted" : "Declined"}
            </Checkbox>
            <button id="reset-checkbox" type="reset">Reset checkbox</button>
            <output id="checkbox-value">{checkboxValue()}</output>
            <output id="checkbox-submits">{checkboxSubmits()}</output>
          </form>
          <SwitchGroup>
            <Switch
              id="browser-switch"
              checked={switchChecked()}
              onChange={(nextChecked) => {
                setSwitchChecked(nextChecked);
                setSwitchChanges((value) => value + 1);
              }}
            >
              {(slot) => slot.checked ? "Enabled" : "Disabled"}
            </Switch>
            <SwitchLabel id="browser-switch-label">Notifications</SwitchLabel>
            <SwitchDescription>Product updates</SwitchDescription>
          </SwitchGroup>
          <output id="switch-changes">{switchChanges()}</output>
          <SwitchGroup>
            <Switch id="passive-switch">Passive target</Switch>
            <SwitchLabel id="passive-switch-label" passive>
              Passive label
            </SwitchLabel>
          </SwitchGroup>
          <SwitchGroup>
            <Switch id="custom-label-switch">Custom target</Switch>
            <SwitchLabel id="custom-switch-label" as="span">
              Custom label
            </SwitchLabel>
          </SwitchGroup>
          <Switch
            id="controlled-switch"
            checked={false}
            tabindex={-1}
            onChange={(nextChecked) =>
              setControlledRequest(String(nextChecked))}
          >
            Controlled
          </Switch>
          <output id="controlled-request">{controlledRequest()}</output>
          <Switch id="span-switch" as="span">Span switch</Switch>
        </>
      )}
      {includeRadioScenarios && (
        <>
          <form
            id="radio-form"
            onSubmit={(event) => {
              event.preventDefault();
              setRadioSubmits((value) => value + 1);
            }}
          >
            <RadioGroup
              id="plans"
              defaultValue="beta"
              name="plan"
              onChange={() => setRadioChanges((value) => value + 1)}
            >
              <RadioGroupLabel>Plan</RadioGroupLabel>
              <RadioGroupDescription>Choose a plan</RadioGroupDescription>
              <Radio id="plan-alpha" value="alpha">Alpha</Radio>
              <Radio id="plan-beta" value="beta">Beta</Radio>
              <Radio id="plan-gamma" value="gamma" disabled>Gamma</Radio>
            </RadioGroup>
            <button id="reset-radios" type="reset">Reset radios</button>
            <output id="radio-changes">{radioChanges()}</output>
            <output id="radio-submits">{radioSubmits()}</output>
          </form>
          <RadioGroup
            id="object-plans"
            by="id"
            defaultValue={{ id: 2, name: "Second" }}
          >
            <Radio id="object-one" value={{ id: 1, name: "First" }}>
              First object
            </Radio>
            <Radio id="object-two" value={{ id: 2, name: "Second copy" }}>
              Second object
            </Radio>
          </RadioGroup>
        </>
      )}
      {includeDisclosureScenarios && (
        <>
          <button
            id="mutate-disclosure-default"
            type="button"
            onClick={() => setDisclosureDefault(true)}
          >
            Mutate disclosure default
          </button>
          <Disclosure defaultOpen={disclosureDefault()}>
            {(slot) => (
              <>
                <output id="disclosure-state">
                  {slot.open ? "open" : "closed"}
                </output>
                <DisclosureButton
                  id="disclosure-primary"
                  onClick={() => setDisclosureClicks((value) => value + 1)}
                >
                  Primary disclosure
                </DisclosureButton>
                <DisclosurePanel id="disclosure-panel">
                  <Disclosure defaultOpen>
                    <DisclosureButton id="nested-disclosure">
                      Nested disclosure
                    </DisclosureButton>
                    <DisclosurePanel>Nested contents</DisclosurePanel>
                  </Disclosure>
                  <DisclosureButton id="stripped-close-id">
                    Close outer
                  </DisclosureButton>
                </DisclosurePanel>
                <button id="disclosure-focus-target" type="button">
                  Focus target
                </button>
                <button
                  id="disclosure-accessor-close"
                  type="button"
                  onClick={() =>
                    slot.close(() =>
                      document.getElementById("disclosure-focus-target")
                    )}
                >
                  Accessor close
                </button>
              </>
            )}
          </Disclosure>
          <output id="disclosure-clicks">{disclosureClicks()}</output>
          <Disclosure>
            <DisclosureButton id="static-trigger">
              Static toggle
            </DisclosureButton>
            <DisclosurePanel id="static-panel" static>
              Static disclosure contents
            </DisclosurePanel>
          </Disclosure>
          <Disclosure>
            <DisclosureButton id="persistent-trigger">
              Persistent toggle
            </DisclosureButton>
            <DisclosurePanel id="persistent-panel" unmount={false}>
              Persistent disclosure contents
            </DisclosurePanel>
          </Disclosure>
          <Disclosure>
            <DisclosureButton
              id="prevented-disclosure"
              onClick={(event) => event.preventDefault()}
            >
              Prevented disclosure
            </DisclosureButton>
            <DisclosurePanel>Prevented contents</DisclosurePanel>
          </Disclosure>
          <Disclosure>
            <DisclosureButton id="disabled-disclosure" disabled>
              Disabled disclosure
            </DisclosureButton>
            <DisclosurePanel>Disabled contents</DisclosurePanel>
          </Disclosure>
        </>
      )}
      {includeKernelScenarios && (
        <>
          <EscapeLayer
            id="outer-layer"
            onEscape={() => setOuterEscapes((value) => value + 1)}
          />
          {showInnerLayer() && (
            <EscapeLayer
              id="inner-layer"
              onEscape={() => setInnerEscapes((value) => value + 1)}
            />
          )}
          <button
            id="toggle-inner-layer"
            type="button"
            onClick={() => setShowInnerLayer((value) => !value)}
          >
            Toggle inner layer
          </button>
          <output id="outer-escapes">{outerEscapes()}</output>
          <output id="inner-escapes">{innerEscapes()}</output>
          <OverlayKernel />
        </>
      )}
      {includeTabScenarios && <TabsScenarios />}
      {includeFocusTrapScenarios && <FocusTrapScenarios />}
      {includeDialogScenarios && <DialogScenarios />}
      {includeTouchMobileScenarios && <TouchMobileScenarios />}
    </>
  );
}

browserGlobal.__disposeHeadlessuiApp = render(
  () => <App />,
  document.getElementById("app")!,
);
