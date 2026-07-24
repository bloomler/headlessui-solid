import { chromium, type Page } from "playwright";
import { build, preview, type PreviewServer } from "vite";
import solid from "vite-plugin-solid";

const DEFAULT_EXECUTABLE = Deno.build.os === "windows"
  ? "C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe"
  : Deno.build.os === "linux"
  ? "/usr/bin/brave-browser"
  : undefined;
const DEBUG = Deno.env.get("HEADLESSUI_BRAVE_DEBUG") === "1";
const SCENARIO_TIMEOUT = Number(
  Deno.env.get("HEADLESSUI_BRAVE_SCENARIO_TIMEOUT_MS") ?? "45000",
);

type Scenario =
  | "boolean"
  | "dialog"
  | "disclosure"
  | "focus-trap"
  | "kernel"
  | "radio"
  | "tabs"
  | "touch-mobile"
  | null;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function reservePort(): number {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return port;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function debug(message: string): void {
  if (DEBUG) console.log(`[brave] ${message}`);
}

async function within<T>(
  promise: Promise<T>,
  milliseconds: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${milliseconds}ms`)),
      milliseconds,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function settleWithin(
  promise: Promise<unknown>,
  milliseconds: number,
): Promise<boolean> {
  return await Promise.race([
    promise.then(() => true, () => true),
    delay(milliseconds).then(() => false),
  ]);
}

async function waitForEndpoint(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Brave has not opened its debugging socket yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Brave did not expose ${url}`);
}

function previewUrl(server: PreviewServer): string {
  const address = server.httpServer?.address();
  assert(address && typeof address === "object", "Vite did not open a port");
  return `http://127.0.0.1:${address.port}`;
}

async function runAssertions(
  page: Page,
  baseUrl: string,
  scenario: Scenario,
): Promise<void> {
  debug(`scenario ${scenario ?? "base"}: navigating`);
  const includeBoolean = scenario === "boolean";
  const includeDisclosure = scenario === "disclosure";
  const includeDialog = scenario === "dialog";
  const includeKernel = scenario === "kernel";
  const includeRadio = scenario === "radio";
  const includeTabs = scenario === "tabs";
  const includeFocusTrap = scenario === "focus-trap";
  const includeTouchMobile = scenario === "touch-mobile";
  const browserErrors: string[] = [];
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(15_000);
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto(
    `${baseUrl}/${scenario ? `?${scenario}` : ""}`,
    { waitUntil: "domcontentloaded" },
  );
  debug(`scenario ${scenario ?? "base"}: DOM content loaded`);
  try {
    await page.locator("#subject").waitFor({ state: "visible" });
  } catch (error) {
    throw new Error(
      `Brave app did not mount. Browser errors: ${
        browserErrors.join("\n") || "none captured"
      }`,
      { cause: error },
    );
  }
  debug(`scenario ${scenario ?? "base"}: base fixture mounted`);

  const subject = page.getByRole("button", { name: "Ready" });
  await subject.click();
  await page.locator("#clicks").waitFor({ state: "visible" });
  assert(
    await page.locator("#clicks").textContent() === "1",
    "Click did not update",
  );

  await page.getByRole("button", { name: "Disable", exact: true }).click();
  const disabled = page.getByRole("button", { name: "Unavailable" });
  await disabled.waitFor({ state: "visible" });
  assert(
    await disabled.isDisabled(),
    "Reactive disabled state did not reach the DOM",
  );
  assert(
    await disabled.getAttribute("data-disabled") === "",
    "Reactive data-disabled state is missing",
  );

  const link = page.getByRole("link", { name: "Profile" });
  assert(
    await link.getAttribute("href") === "#profile",
    "Polymorphic href is missing",
  );
  assert(
    await link.getAttribute("type") === null,
    "Anchor received button type",
  );

  const portal = page.locator("#headlessui-portal-root #portaled");
  await portal.waitFor({ state: "visible" });
  assert(await portal.textContent() === "Portaled", "Portal target is missing");
  assert(
    !await page.locator("#app").locator("#portaled").count(),
    "Portal remained inside its logical parent",
  );

  await page.getByRole("button", { name: "Close panel" }).click();
  assert(
    await page.locator("#closes").textContent() === "1",
    "CloseButton did not invoke the nearest close provider",
  );
  assert(
    await page.locator("#close-clicks").textContent() === "1",
    "CloseButton did not preserve the consumer click handler",
  );

  if (includeBoolean) {
    const checkbox = page.locator("#browser-checkbox");
    assert(
      await checkbox.getAttribute("aria-checked") === "true",
      "Checkbox did not render its default checked state",
    );
    await checkbox.click();
    assert(
      await checkbox.getAttribute("aria-checked") === "false" &&
        await page.locator("#checkbox-value").textContent() === "null",
      "Checkbox click did not synchronously update state and form data",
    );
    await checkbox.press("Space");
    assert(
      await checkbox.getAttribute("data-checked") === "" &&
        await page.locator("#checkbox-value").textContent() === "accepted",
      "Checkbox Space handling did not restore its checked form value",
    );
    await checkbox.press("Space");
    await page.locator("#reset-checkbox").click();
    assert(
      await checkbox.getAttribute("aria-checked") === "true" &&
        await page.locator("#checkbox-value").textContent() === "accepted",
      "Checkbox reset did not restore its default state",
    );
    await checkbox.press("Enter");
    assert(
      await page.locator("#checkbox-submits").textContent() === "1",
      "Checkbox Enter handling did not submit its form",
    );

    await page.locator("#browser-switch-label").click();
    const switchControl = page.locator("#browser-switch");
    assert(
      await switchControl.getAttribute("aria-checked") === "true" &&
        await page.locator("#switch-changes").textContent() === "1",
      "Switch label did not toggle exactly once",
    );
    assert(
      await page.evaluate(() => document.activeElement?.id) ===
        "browser-switch",
      "Switch label did not focus its control",
    );
    assert(
      (await switchControl.getAttribute("aria-describedby"))?.startsWith(
        "headlessui-description-",
      ),
      "Switch description was not associated",
    );

    await page.locator("#passive-switch-label").click();
    assert(
      await page.locator("#passive-switch").getAttribute("aria-checked") ===
        "false",
      "A passive Switch label toggled its control",
    );
    await page.locator("#custom-switch-label").click();
    assert(
      await page.locator("#custom-label-switch").getAttribute(
            "aria-checked",
          ) === "true" &&
        await page.evaluate(() => document.activeElement?.id) ===
          "custom-label-switch",
      "A custom Switch label did not toggle and focus its control",
    );

    const controlledSwitch = page.locator("#controlled-switch");
    assert(
      await controlledSwitch.getAttribute("tabindex") === "0",
      "Switch did not normalize tabindex=-1",
    );
    await controlledSwitch.press("Space");
    assert(
      await controlledSwitch.getAttribute("aria-checked") === "false" &&
        await page.locator("#controlled-request").textContent() === "true",
      "Controlled Switch did not preserve external authority",
    );
    assert(
      await page.locator("#span-switch").getAttribute("type") === null,
      "A polymorphic non-button Switch received a button type",
    );
  }

  if (includeRadio) {
    const group = page.locator("#plans");
    const labelledBy = await group.getAttribute("aria-labelledby");
    const describedBy = await group.getAttribute("aria-describedby");
    assert(
      labelledBy?.startsWith("headlessui-label-") &&
        describedBy?.startsWith("headlessui-description-"),
      "RadioGroup label/description associations are missing",
    );

    const alpha = page.locator("#plan-alpha");
    const beta = page.locator("#plan-beta");
    const gamma = page.locator("#plan-gamma");
    assert(
      await beta.getAttribute("aria-checked") === "true" &&
        await beta.getAttribute("tabindex") === "0" &&
        await alpha.getAttribute("tabindex") === "-1",
      "RadioGroup did not establish its default checked/roving state",
    );

    await alpha.click();
    assert(
      await alpha.getAttribute("aria-checked") === "true" &&
        await page.locator("#radio-changes").textContent() === "1" &&
        await page.evaluate(() => {
            const form = document.querySelector<HTMLFormElement>("#radio-form");
            return form ? new FormData(form).get("plan") : null;
          }) === "alpha",
      "Radio click did not update selection, callback, and form state",
    );

    await alpha.press("ArrowLeft");
    assert(
      await beta.getAttribute("aria-checked") === "true" &&
        await page.evaluate(() => document.activeElement?.id) === "plan-beta",
      "Radio ArrowLeft did not wrap past the disabled option",
    );
    await beta.press("ArrowRight");
    assert(
      await alpha.getAttribute("aria-checked") === "true" &&
        await page.evaluate(() => document.activeElement?.id) === "plan-alpha",
      "Radio ArrowRight did not wrap past the disabled option",
    );
    await gamma.click({ force: true });
    assert(
      await alpha.getAttribute("aria-checked") === "true",
      "A disabled Radio changed the selection",
    );

    await page.locator("#reset-radios").click();
    assert(
      await beta.getAttribute("aria-checked") === "true",
      "RadioGroup reset did not restore its default value",
    );
    await beta.press("Enter");
    assert(
      await page.locator("#radio-submits").textContent() === "1",
      "Radio Enter handling did not submit its form",
    );
    assert(
      await page.locator("#object-two").getAttribute("aria-checked") ===
        "true",
      'RadioGroup by="id" did not compare object values',
    );
  }

  if (includeDisclosure) {
    const primary = page.locator("#disclosure-primary");
    assert(
      await primary.getAttribute("aria-expanded") === "false" &&
        await primary.getAttribute("aria-controls") === null &&
        await page.locator("#disclosure-panel").count() === 0,
      "Disclosure did not start closed and unmounted",
    );
    await page.locator("#mutate-disclosure-default").click();
    assert(
      await primary.getAttribute("aria-expanded") === "false",
      "Disclosure treated defaultOpen as a live controlled prop",
    );

    await primary.click();
    assert(
      await primary.getAttribute("aria-expanded") === "true" &&
        await primary.getAttribute("aria-controls") === "disclosure-panel" &&
        await primary.getAttribute("data-open") === "" &&
        await page.locator("#disclosure-clicks").textContent() === "1",
      "Disclosure click did not update ARIA, state data, and consumer handler",
    );

    const nested = page.locator("#nested-disclosure");
    await nested.click();
    assert(
      await primary.getAttribute("aria-expanded") === "true" &&
        await nested.getAttribute("aria-expanded") === "false",
      "Nested Disclosure did not remain isolated from its parent",
    );
    const closeOuter = page.getByRole("button", { name: "Close outer" });
    assert(
      await closeOuter.getAttribute("id") === null &&
        await closeOuter.getAttribute("aria-expanded") === null,
      "An in-panel DisclosureButton retained trigger identity",
    );
    await closeOuter.click();
    assert(
      await primary.getAttribute("aria-expanded") === "false" &&
        await page.evaluate(() => document.activeElement?.id) ===
          "disclosure-primary",
      "An in-panel DisclosureButton did not close and restore focus",
    );

    await primary.press("Enter");
    assert(
      await primary.getAttribute("aria-expanded") === "true",
      "Disclosure Enter handling did not open",
    );
    await primary.press("Space");
    assert(
      await primary.getAttribute("aria-expanded") === "false",
      "Disclosure Space handling did not close",
    );
    await primary.click();
    await page.locator("#disclosure-accessor-close").click();
    assert(
      await primary.getAttribute("aria-expanded") === "false" &&
        await page.evaluate(() => document.activeElement?.id) ===
          "disclosure-focus-target",
      "Disclosure close(accessor) did not close and focus its target",
    );

    assert(
      await page.locator("#static-panel").isVisible(),
      "A static DisclosurePanel was not kept visible",
    );
    const persistent = page.locator("#persistent-panel");
    assert(
      await persistent.getAttribute("hidden") !== null &&
        await persistent.isHidden(),
      "A persistent closed DisclosurePanel was not hidden",
    );
    await page.locator("#persistent-trigger").click();
    assert(
      await persistent.isVisible(),
      "A persistent DisclosurePanel did not become visible",
    );

    await page.locator("#prevented-disclosure").click();
    await page.locator("#disabled-disclosure").click({ force: true });
    assert(
      await page.locator("#prevented-disclosure").getAttribute(
            "aria-expanded",
          ) === "false" &&
        await page.locator("#disabled-disclosure").getAttribute(
            "aria-expanded",
          ) === "false",
      "Prevented or disabled Disclosure buttons opened",
    );
  }

  if (includeDialog) {
    debug("dialog: starting assertions");
    const persistent = page.locator("#persistent-dialog");
    assert(
      await persistent.count() === 0,
      "The retained Dialog mounted before its explicit fixture action",
    );

    await page.locator("#dialog-opener").click();
    debug("dialog: opener clicked");
    const dialog = page.locator("#dialog-root");
    await dialog.waitFor({ state: "visible" });
    assert(
      await dialog.evaluate((element) => element.tagName) === "ARTICLE" &&
        await dialog.getAttribute("role") === "dialog" &&
        await dialog.getAttribute("aria-modal") === "true" &&
        await dialog.getAttribute("aria-labelledby") === "dialog-title" &&
        await dialog.getAttribute("aria-describedby") ===
          "dialog-description",
      `Dialog root semantics or associations are incorrect: ${
        JSON.stringify({
          describedby: await dialog.getAttribute("aria-describedby"),
          browserErrors,
          labelledby: await dialog.getAttribute("aria-labelledby"),
          modal: await dialog.getAttribute("aria-modal"),
          role: await dialog.getAttribute("role"),
          tag: await dialog.evaluate((element) => element.tagName),
        })
      }`,
    );
    debug("dialog: root semantics and associations verified");
    assert(
      await page.locator("#dialog-backdrop").getAttribute("aria-hidden") ===
          "true" &&
        await page.locator("#app").getAttribute("aria-hidden") === "true" &&
        await page.locator("#app").evaluate((element) =>
          (element as HTMLElement).inert
        ) &&
        await page.evaluate(() => document.documentElement.style.overflow) ===
          "hidden" &&
        await page.evaluate(() => document.activeElement?.id) ===
          "dialog-first" &&
        await page.locator("[data-headlessui-focus-guard]").count() === 2,
      `Dialog did not establish modal focus, inert, and scroll state: ${
        JSON.stringify({
          active: await page.evaluate(() => document.activeElement?.id),
          activeElement: await page.evaluate(() =>
            document.activeElement?.outerHTML
          ),
          appHidden: await page.locator("#app").getAttribute("aria-hidden"),
          appInert: await page.locator("#app").evaluate((element) =>
            (element as HTMLElement).inert
          ),
          backdropHidden: await page.locator("#dialog-backdrop").getAttribute(
            "aria-hidden",
          ),
          browserErrors,
          dataOpen: await dialog.getAttribute("data-open"),
          guards: await page.locator("[data-headlessui-focus-guard]").count(),
          overflow: await page.evaluate(() =>
            document.documentElement.style.overflow
          ),
        })
      }`,
    );
    debug("dialog: modal focus, inertness, guards, and scroll verified");

    await page.locator("#dialog-first").evaluate((element) =>
      (element as HTMLElement).click()
    );
    assert(
      await page.locator("#dialog-portal").count() === 1,
      `Dialog nested Portal did not mount: ${
        JSON.stringify({
          browserErrors,
          body: await page.locator("body").innerHTML(),
        })
      }`,
    );
    await page.locator("#dialog-portal").evaluate((element) =>
      (element as HTMLElement).click()
    );
    assert(
      await dialog.isVisible() &&
        await page.locator("#dialog-close-requests").textContent() === "0" &&
        await page.locator("#dialog-portal-clicks").textContent() === "1",
      "A panel or registered Portal interaction closed the Dialog",
    );
    debug("dialog: registered nested Portal interaction verified");
    await page.locator("#dialog-backdrop").click({ position: { x: 5, y: 5 } });
    await dialog.waitFor({ state: "detached" });
    assert(
      await page.locator("#dialog-close-requests").textContent() === "1" &&
        await page.locator("#app").getAttribute("aria-hidden") === null &&
        !await page.locator("#app").evaluate((element) =>
          (element as HTMLElement).inert
        ) &&
        await page.evaluate(() => document.documentElement.style.overflow) ===
          "" &&
        await page.evaluate(() => document.activeElement?.id) ===
          "dialog-opener",
      "Dialog outside-close did not restore modal side effects and focus",
    );
    debug("dialog: backdrop close and restoration verified");

    await page.locator("#dialog-opener").click();
    debug("dialog: reopened for nested Dialog");
    await page.locator("#dialog-open-inner").evaluate((element) =>
      (element as HTMLElement).click()
    );
    debug("dialog: inner opener dispatched");
    try {
      await page.locator("#dialog-inner-panel").waitFor({ state: "visible" });
    } catch (error) {
      throw new Error(
        `Inner Dialog did not become visible. Browser errors: ${
          browserErrors.join("\n") || "none captured"
        }`,
        { cause: error },
      );
    }
    debug("dialog: inner panel visible");
    assert(
      await page.locator('[role="dialog"]:visible').count() === 2 &&
        await page.evaluate(() => document.activeElement?.id) ===
          "dialog-inner-first" &&
        await page.locator("[data-headlessui-focus-guard]").count() === 2,
      "Nested Dialog did not acquire focus and top-layer ownership",
    );
    debug("dialog: nested focus ownership verified");
    await page.evaluate(() =>
      document.getElementById("dialog-outside")?.focus()
    );
    assert(
      await page.evaluate(() => document.activeElement?.id) ===
        "dialog-inner-first",
      "Nested Dialog allowed focus into inert outside content",
    );
    debug("dialog: nested focus lock verified");
    await page.keyboard.press("Escape");
    await page.locator("#dialog-inner-panel").waitFor({ state: "detached" });
    assert(
      await page.evaluate(() => document.activeElement?.id) ===
          "dialog-open-inner" && await dialog.isVisible(),
      "Escape did not close only the top-most Dialog and restore its opener",
    );
    debug("dialog: nested Escape restoration verified");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert(
      await page.locator("#dialog-close-requests").textContent() === "2" &&
        await page.evaluate(() => document.activeElement?.id) ===
          "dialog-opener",
      "Second Escape did not close and restore the outer Dialog",
    );
    debug("dialog: outer Escape restoration verified");

    await page.locator("#dialog-opener").click();
    await page.locator("#dialog-disappear").evaluate((element) =>
      (element as HTMLElement).click()
    );
    await dialog.waitFor({ state: "detached" });
    assert(
      await page.locator("#dialog-close-requests").textContent() === "3",
      "A layout-disappeared Dialog did not request close",
    );
    debug("dialog: disappear close verified");

    await page.locator("#persistent-dialog-opener").click();
    await persistent.waitFor({ state: "visible" });
    assert(
      await persistent.getAttribute("aria-modal") === "true" &&
        await persistent.evaluate((element) =>
            element.parentElement?.dataset.headlessuiPortal
          ) === "" &&
        await page.evaluate(() => document.activeElement?.id) ===
          "persistent-dialog-close",
      "Retained polymorphic Dialog did not open as the direct portal root",
    );
    debug("dialog: retained transition open verified");
    await page.locator("#persistent-dialog-close").click();
    await persistent.waitFor({ state: "hidden" });
    await page.waitForFunction(() =>
      document.getElementById("dialog-after-leave")?.textContent === "1"
    );
    assert(
      await persistent.count() === 1 &&
        await persistent.getAttribute("hidden") !== null &&
        await persistent.evaluate((element) =>
            (element as HTMLElement).style.display
          ) === "none" &&
        await persistent.getAttribute("aria-modal") === null &&
        await page.evaluate(() => document.documentElement.style.overflow) ===
          "" &&
        !await page.locator("#app").evaluate((element) =>
          (element as HTMLElement).inert
        ),
      "Retained Dialog did not finish leave hidden with side effects released",
    );
    debug("dialog: retained transition leave verified");
  }

  if (includeKernel) {
    await page.keyboard.press("Escape");
    assert(
      await page.locator("#inner-escapes").textContent() === "1" &&
        await page.locator("#outer-escapes").textContent() === "0",
      "Escape was not limited to the top-most layer",
    );

    await page.locator("#toggle-inner-layer").click();
    await page.locator("#inner-layer").waitFor({ state: "detached" });
    await page.keyboard.press("Escape");
    assert(
      await page.locator("#inner-escapes").textContent() === "1" &&
        await page.locator("#outer-escapes").textContent() === "1",
      "Removing the top layer did not restore Escape ownership",
    );

    await page.locator("#toggle-inner-layer").click();
    await page.locator("#inner-layer").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    assert(
      await page.locator("#inner-escapes").textContent() === "2" &&
        await page.locator("#outer-escapes").textContent() === "1",
      "A remounted layer did not become the top-most Escape owner",
    );

    const outsideClicksBefore = Number(
      await page.locator("#outside-clicks").textContent(),
    );
    await page.locator("#inside-target").click();
    assert(
      Number(await page.locator("#outside-clicks").textContent()) ===
        outsideClicksBefore,
      "An inside pointer sequence was treated as an outside click",
    );
    await page.locator("#outside-target").click();
    assert(
      Number(await page.locator("#outside-clicks").textContent()) ===
        outsideClicksBefore + 1,
      "An outside pointer sequence was not detected",
    );

    const dynamicPortalParent = page.locator("#dynamic-portal-parent");
    assert(
      await dynamicPortalParent.locator("#dynamic-portal-content").count() ===
        1,
      "A disabled Portal did not render inline",
    );
    await page.locator("#toggle-dynamic-portal").click();
    await page.locator(
      "#headlessui-portal-root #dynamic-portal-content",
    ).waitFor({ state: "visible" });
    assert(
      await dynamicPortalParent.locator("#dynamic-portal-content").count() ===
        0,
      "A reactively enabled Portal remained inline",
    );
    await page.locator("#toggle-dynamic-portal").click();
    await dynamicPortalParent.locator("#dynamic-portal-content").waitFor({
      state: "visible",
    });
    assert(
      await page.locator(
        "#headlessui-portal-root #dynamic-portal-content",
      ).count() === 0,
      "A reactively disabled Portal remained portalled",
    );

    await page.locator("#mount-late-settled-child").click();
    await page.locator("#late-settled-child").waitFor({ state: "visible" });
    await page.waitForFunction(() =>
      document.getElementById("late-settled-runs")?.textContent === "1"
    );
    assert(
      await page.locator("#late-settled-runs").textContent() === "1",
      "onSettled did not run for a component mounted after root settlement",
    );
    await page.locator("#mount-late-portalled-child").click();
    await page.locator("#late-portalled-child").waitFor({ state: "visible" });
    await page.waitForFunction(() =>
      document.getElementById("late-portalled-settled-runs")?.textContent ===
        "1"
    );
    assert(
      await page.locator("#late-portalled-settled-runs").textContent() === "1",
      "onSettled did not run for a late-mounted component inside Portal",
    );
    await page.locator("#resolve-roots").click();
    const rootIds = (await page.locator("#root-ids").textContent())?.split(",");
    assert(
      rootIds?.includes("overlay-kernel") &&
        rootIds.includes("third-party-root") &&
        !rootIds.includes("app") &&
        !rootIds.includes("headlessui-portal-root"),
      `Root container resolution was incorrect: ${rootIds?.join(",")}`,
    );

    await page.locator("#enable-inert").click();
    await page.waitForFunction(() =>
      document.getElementById("subject")?.inert === true &&
      document.getElementById("third-party-root")?.inert === true
    );
    assert(
      await page.locator("#third-party-root").getAttribute("aria-hidden") ===
        "true",
      "Disallowed content was not hidden from assistive technology",
    );
    await page.locator("#disable-inert").click();
    await page.waitForFunction(() =>
      document.getElementById("subject")?.inert === false &&
      document.getElementById("third-party-root")?.inert === false
    );
    assert(
      await page.locator("#third-party-root").getAttribute("aria-hidden") ===
        "false",
      "Inert cleanup did not restore the original aria-hidden value",
    );

    await page.locator("#enable-scroll-lock").click();
    await page.waitForFunction(() =>
      document.documentElement.style.overflow === "hidden"
    );
    await page.locator("#disable-scroll-lock").click();
    await page.waitForFunction(() =>
      document.documentElement.style.overflow === ""
    );

    const focusableHidden = page.locator("#focusable-hidden");
    const focusableHiddenState = {
      ariaHidden: await focusableHidden.getAttribute("aria-hidden"),
      hidden: await focusableHidden.getAttribute("hidden"),
      position: await focusableHidden.evaluate((element) =>
        (element as HTMLElement).style.position
      ),
    };
    assert(
      focusableHiddenState.ariaHidden === "true" &&
        focusableHiddenState.hidden === null &&
        focusableHiddenState.position === "fixed",
      `Focusable Hidden semantics are incorrect: ${
        JSON.stringify(focusableHiddenState)
      }`,
    );
    const fullyHidden = page.locator("#fully-hidden");
    const fullyHiddenState = {
      hidden: await fullyHidden.getAttribute("hidden"),
      display: await fullyHidden.evaluate((element) =>
        (element as HTMLElement).style.display
      ),
    };
    assert(
      fullyHiddenState.hidden !== null && fullyHiddenState.display === "none",
      `Completely Hidden semantics are incorrect: ${
        JSON.stringify(fullyHiddenState)
      }`,
    );

    await page.waitForFunction(() =>
      document.getElementById("floating-panel")?.dataset.anchor ===
        "bottom start"
    );
    const bottomGeometry = await page.evaluate(() => {
      const reference = document.getElementById("floating-reference")!
        .getBoundingClientRect();
      const panel = document.getElementById("floating-panel")!
        .getBoundingClientRect();
      return {
        referenceBottom: reference.bottom,
        referenceLeft: reference.left,
        panelLeft: panel.left,
        panelTop: panel.top,
      };
    });
    assert(
      Math.abs(
            bottomGeometry.panelTop - (bottomGeometry.referenceBottom + 8),
          ) < 1 &&
        Math.abs(
            bottomGeometry.panelLeft - (bottomGeometry.referenceLeft + 4),
          ) < 1,
      `Floating bottom/start geometry is incorrect: ${
        JSON.stringify(bottomGeometry)
      }`,
    );
    await page.locator("#flip-floating-placement").click();
    await page.waitForFunction(() =>
      document.getElementById("floating-panel")?.dataset.anchor === "top end"
    );
    const topGeometry = await page.evaluate(() => {
      const reference = document.getElementById("floating-reference")!
        .getBoundingClientRect();
      const panel = document.getElementById("floating-panel")!
        .getBoundingClientRect();
      return {
        referenceRight: reference.right,
        referenceTop: reference.top,
        panelBottom: panel.bottom,
        panelRight: panel.right,
      };
    });
    assert(
      Math.abs(topGeometry.panelBottom - (topGeometry.referenceTop - 8)) < 1 &&
        Math.abs(
            topGeometry.panelRight - (topGeometry.referenceRight + 4),
          ) < 1,
      `Floating top/end geometry is incorrect: ${JSON.stringify(topGeometry)}`,
    );

    await page.locator("#hide-disappear-target").click();
    await page.waitForFunction(() =>
      Number(document.getElementById("disappeared")?.textContent ?? "0") >= 1
    );
  }

  if (includeTouchMobile) {
    const setup = await page.evaluate(() => {
      Object.defineProperties(navigator, {
        maxTouchPoints: {
          configurable: true,
          get: () => 5,
        },
        platform: {
          configurable: true,
          get: () => "iPhone",
        },
      });

      const root = document.documentElement;
      const viewportWidth = globalThis.innerWidth;
      Object.defineProperties(root, {
        clientWidth: {
          configurable: true,
          get: () => viewportWidth - 100,
        },
        offsetWidth: {
          configurable: true,
          get: () => viewportWidth - 120,
        },
      });

      globalThis.scrollTo(0, 120);

      const styles = document.createElement("style");
      styles.id = "touch-mobile-baseline-styles";
      styles.textContent = `
        html {
          padding-right: 3px;
          scroll-behavior: smooth;
        }
        #touch-allowed {
          overscroll-behavior: auto;
        }
        #touch-disallowed-target {
          touch-action: pan-y;
        }
      `;
      document.head.append(styles);

      const hashTarget = document.getElementById("touch-hash-target")!;
      hashTarget.scrollIntoView = (
        options?: boolean | ScrollIntoViewOptions,
      ) => {
        hashTarget.dataset.scrollRestored = typeof options === "object"
          ? options.block ?? "missing"
          : "missing";
      };

      return {
        computedPadding: getComputedStyle(root).paddingRight,
        computedScrollBehavior: getComputedStyle(root).scrollBehavior,
        maxTouchPoints: navigator.maxTouchPoints,
        platform: navigator.platform,
        scrollY: globalThis.scrollY,
      };
    });
    assert(
      setup.platform === "iPhone" &&
        setup.maxTouchPoints === 5 &&
        setup.scrollY === 120 &&
        setup.computedPadding === "3px" &&
        setup.computedScrollBehavior === "smooth",
      `Mobile fixture setup failed: ${JSON.stringify(setup)}`,
    );

    await page.evaluate(() =>
      (document.getElementById("touch-enable-lock") as HTMLButtonElement)
        .click()
    );
    await page.waitForFunction(() => {
      const root = document.documentElement;
      return root.style.overflow === "hidden" &&
        root.style.paddingRight === "80px" &&
        root.style.scrollBehavior === "auto";
    });
    const lockedStyles = await page.evaluate(() => {
      const root = document.documentElement;
      return {
        overflow: root.style.overflow,
        paddingRight: root.style.paddingRight,
        scrollBehavior: root.style.scrollBehavior,
      };
    });
    assert(
      lockedStyles.overflow === "hidden" &&
        lockedStyles.paddingRight === "80px" &&
        lockedStyles.scrollBehavior === "auto",
      `iOS scroll-lock styles were incorrect: ${JSON.stringify(lockedStyles)}`,
    );

    const touchState = await page.evaluate(() => {
      const allowed = document.getElementById("touch-allowed") as HTMLElement;
      const allowedTarget = document.getElementById(
        "touch-allowed-target",
      ) as HTMLElement;
      const disallowedTarget = document.getElementById(
        "touch-disallowed-target",
      ) as HTMLElement;
      const dispatchTouch = (
        target: HTMLElement,
        type: "touchmove" | "touchstart",
      ): boolean => {
        const event = new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
        });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      };

      dispatchTouch(allowedTarget, "touchstart");
      const allowedOverscrollOnStart = allowed.style.overscrollBehavior;
      const allowedMovePrevented = dispatchTouch(allowedTarget, "touchmove");

      dispatchTouch(disallowedTarget, "touchstart");
      const allowedOverscrollAfterDisallowed = allowed.style.overscrollBehavior;
      const allowedOverscrollComputedAfterDisallowed = getComputedStyle(allowed)
        .overscrollBehavior;
      const disallowedTouchAction = disallowedTarget.style.touchAction;
      const disallowedMovePrevented = dispatchTouch(
        disallowedTarget,
        "touchmove",
      );

      dispatchTouch(allowedTarget, "touchstart");
      const disallowedTouchActionAfterAllowed =
        disallowedTarget.style.touchAction;
      const disallowedTouchActionComputedAfterAllowed = getComputedStyle(
        disallowedTarget,
      ).touchAction;
      const allowedOverscrollAfterRestart = allowed.style.overscrollBehavior;

      return {
        allowedMovePrevented,
        allowedOverscrollAfterDisallowed,
        allowedOverscrollAfterRestart,
        allowedOverscrollComputedAfterDisallowed,
        allowedOverscrollOnStart,
        disallowedMovePrevented,
        disallowedTouchAction,
        disallowedTouchActionAfterAllowed,
        disallowedTouchActionComputedAfterAllowed,
      };
    });
    assert(
      touchState.allowedOverscrollOnStart === "contain" &&
        touchState.allowedMovePrevented === false &&
        touchState.allowedOverscrollAfterDisallowed === "" &&
        touchState.allowedOverscrollComputedAfterDisallowed === "auto" &&
        touchState.disallowedTouchAction === "none" &&
        touchState.disallowedMovePrevented === true &&
        touchState.disallowedTouchActionAfterAllowed === "" &&
        touchState.disallowedTouchActionComputedAfterAllowed === "pan-y" &&
        touchState.allowedOverscrollAfterRestart === "contain",
      `iOS touch containment diverged: ${JSON.stringify(touchState)}`,
    );

    const interaction = page.locator("#touch-interaction");
    await interaction.dispatchEvent("pointerenter", { pointerType: "touch" });
    assert(
      await interaction.getAttribute("data-hover") === null,
      "A touch pointer incorrectly established hover state",
    );
    await interaction.dispatchEvent("pointerenter", { pointerType: "mouse" });
    await page.waitForFunction(() =>
      document.getElementById("touch-interaction")?.hasAttribute("data-hover")
    );
    await interaction.dispatchEvent("pointerleave", { pointerType: "touch" });
    assert(
      await interaction.getAttribute("data-hover") === "",
      "A synthetic touch leave incorrectly cleared mouse hover state",
    );
    await interaction.dispatchEvent("pointerleave", { pointerType: "mouse" });
    await page.waitForFunction(() =>
      !document.getElementById("touch-interaction")?.hasAttribute("data-hover")
    );

    await interaction.dispatchEvent("pointerdown", {
      buttons: 1,
      pointerType: "touch",
    });
    await page.waitForFunction(() =>
      document.getElementById("touch-interaction")?.hasAttribute("data-active")
    );
    await page.evaluate(() =>
      document.dispatchEvent(
        new PointerEvent("pointercancel", {
          bubbles: true,
          cancelable: true,
          pointerType: "touch",
        }),
      )
    );
    await page.waitForFunction(() =>
      !document.getElementById("touch-interaction")?.hasAttribute("data-active")
    );

    await interaction.dispatchEvent("pointerdown", {
      buttons: 1,
      pointerType: "touch",
    });
    await page.waitForFunction(() =>
      document.getElementById("touch-interaction")?.hasAttribute("data-active")
    );
    await page.evaluate(() => {
      document.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          buttons: 1,
          clientX: -10_000,
          clientY: -10_000,
          height: 1,
          pointerType: "touch",
          width: 1,
        }),
      );
    });
    await page.waitForFunction(() =>
      !document.getElementById("touch-interaction")?.hasAttribute("data-active")
    );
    await page.evaluate(() =>
      document.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerType: "touch",
        }),
      )
    );

    await page.evaluate(() => {
      (document.getElementById("touch-hash-link") as HTMLAnchorElement).click();
      globalThis.scrollTo(0, 360);
    });
    await page.waitForFunction(() => globalThis.scrollY === 360);

    await page.evaluate(() =>
      (document.getElementById(
        "touch-disable-lock",
      ) as HTMLButtonElement).click()
    );
    await page.waitForFunction(() => {
      const root = document.documentElement;
      const allowed = document.getElementById("touch-allowed") as HTMLElement;
      const disallowed = document.getElementById(
        "touch-disallowed-target",
      ) as HTMLElement;
      return root.style.overflow === "" &&
        root.style.paddingRight === "" &&
        root.style.scrollBehavior === "" &&
        getComputedStyle(root).paddingRight === "3px" &&
        getComputedStyle(root).scrollBehavior === "smooth" &&
        allowed.style.overscrollBehavior === "" &&
        disallowed.style.touchAction === "" &&
        document.getElementById("touch-hash-target")?.dataset.scrollRestored ===
          "nearest" &&
        globalThis.scrollY === 120;
    });
    const cleanupState = await page.evaluate(() => {
      const root = document.documentElement;
      const allowed = document.getElementById("touch-allowed") as HTMLElement;
      const disallowed = document.getElementById(
        "touch-disallowed-target",
      ) as HTMLElement;
      return {
        allowedOverscroll: allowed.style.overscrollBehavior,
        allowedOverscrollComputed: getComputedStyle(allowed)
          .overscrollBehavior,
        disallowedTouchAction: disallowed.style.touchAction,
        disallowedTouchActionComputed: getComputedStyle(disallowed).touchAction,
        hashRestored: document.getElementById("touch-hash-target")?.dataset
          .scrollRestored,
        overflow: root.style.overflow,
        paddingRight: root.style.paddingRight,
        paddingRightComputed: getComputedStyle(root).paddingRight,
        scrollBehavior: root.style.scrollBehavior,
        scrollBehaviorComputed: getComputedStyle(root).scrollBehavior,
        scrollY: globalThis.scrollY,
      };
    });
    assert(
      cleanupState.overflow === "" &&
        cleanupState.paddingRight === "" &&
        cleanupState.paddingRightComputed === "3px" &&
        cleanupState.scrollBehavior === "" &&
        cleanupState.scrollBehaviorComputed === "smooth" &&
        cleanupState.allowedOverscroll === "" &&
        cleanupState.allowedOverscrollComputed === "auto" &&
        cleanupState.disallowedTouchAction === "" &&
        cleanupState.disallowedTouchActionComputed === "pan-y" &&
        cleanupState.hashRestored === "nearest" &&
        cleanupState.scrollY === 120,
      `Mobile scroll-lock cleanup diverged: ${JSON.stringify(cleanupState)}`,
    );
  }

  if (includeTabs) {
    const alpha = page.locator("#auto-alpha");
    const beta = page.locator("#auto-beta");
    const gamma = page.locator("#auto-gamma");
    assert(
      await alpha.getAttribute("aria-selected") === "true" &&
        await alpha.getAttribute("aria-controls") === "auto-alpha-panel" &&
        await beta.isDisabled(),
      "Tabs did not establish their initial ARIA and disabled state",
    );
    await alpha.focus();
    await alpha.press("ArrowRight");
    assert(
      await gamma.getAttribute("aria-selected") === "true" &&
        await page.evaluate(() => document.activeElement?.id) === "auto-gamma",
      "Automatic Tabs did not skip a disabled tab",
    );
    await gamma.press("ArrowRight");
    assert(
      await alpha.getAttribute("aria-selected") === "true" &&
        await page.evaluate(() => document.activeElement?.id) === "auto-alpha",
      "Automatic Tabs did not wrap",
    );

    const manualAlpha = page.locator("#manual-alpha");
    const manualGamma = page.locator("#manual-gamma");
    assert(
      await page.locator("#manual-tab-list").getAttribute(
        "aria-orientation",
      ) === "vertical",
      "Vertical Tabs did not expose orientation",
    );
    await manualAlpha.focus();
    await manualAlpha.press("ArrowDown");
    assert(
      await page.evaluate(() => document.activeElement?.id) ===
          "manual-gamma" &&
        await manualAlpha.getAttribute("aria-selected") === "true" &&
        await manualGamma.getAttribute("aria-selected") === "false",
      "Manual Tabs selected while moving focus",
    );
    await manualGamma.press("Enter");
    assert(
      await manualGamma.getAttribute("aria-selected") === "true",
      "Manual Tabs did not select on Enter",
    );

    await page.locator("#controlled-tab-three").click();
    assert(
      await page.locator("#controlled-tab-two").getAttribute(
            "aria-selected",
          ) === "true" &&
        await page.locator("#controlled-tab-request").textContent() === "2",
      "Controlled Tabs did not preserve external authority",
    );

    assert(
      await page.locator("#strategy-persistent").isHidden() &&
        await page.locator("#strategy-static").isVisible() &&
        await page.locator("#strategy-unmounted").evaluate((element) =>
            element.tagName
          ) === "SPAN",
      "TabPanel render strategies diverged from the Headless UI contract",
    );

    const dynamicAlpha = page.locator("#dynamic-alpha");
    await dynamicAlpha.click();
    await page.locator("#reverse-dynamic-tabs").click();
    await page.waitForFunction(() =>
      document.querySelector("#dynamic-tab-list")?.firstElementChild?.id ===
        "dynamic-gamma" &&
      document.getElementById("dynamic-tab-index")?.textContent === "2" &&
      document.getElementById("dynamic-alpha")?.getAttribute(
          "aria-selected",
        ) === "true"
    );
    const dynamicState = {
      index: await page.locator("#dynamic-tab-index").textContent(),
      selected: await dynamicAlpha.getAttribute("aria-selected"),
    };
    assert(
      dynamicState.selected === "true" && dynamicState.index === "2",
      `Uncontrolled Tabs lost selected identity after DOM reordering: ${
        JSON.stringify(dynamicState)
      }`,
    );
  }

  if (includeFocusTrap) {
    await page.locator("#focus-trap-opener").click();
    await page.waitForFunction(() =>
      document.activeElement?.id === "focus-trap-preferred"
    );
    assert(
      await page.locator("[data-headlessui-focus-guard]").count() === 2,
      "FocusTrap did not install exactly two guards",
    );

    await page.locator("#focus-trap-portal").focus();
    assert(
      await page.evaluate(() => document.activeElement?.id) ===
        "focus-trap-portal",
      "FocusTrap rejected an explicitly allowed Portal container",
    );
    await page.locator("#focus-trap-outside").focus();
    assert(
      await page.evaluate(() => document.activeElement?.id) ===
        "focus-trap-portal",
      "FocusTrap did not restore focus after a programmatic escape",
    );

    await page.locator("#focus-trap-open-inner").click();
    await page.waitForFunction(() =>
      document.activeElement?.id === "focus-trap-inner-first"
    );
    assert(
      await page.locator("[data-headlessui-focus-guard]").count() === 2,
      "Nested FocusTraps did not transfer top-layer guard ownership",
    );
    await page.locator("#focus-trap-outside").focus();
    assert(
      await page.evaluate(() => document.activeElement?.id) ===
        "focus-trap-inner-first",
      "A nested FocusTrap allowed focus to escape",
    );

    await page.locator("#focus-trap-close-inner").click();
    await page.locator("#focus-trap-inner-first").waitFor({
      state: "detached",
    });
    const restoredInnerOpener = await page.evaluate(() =>
      document.activeElement?.id
    );
    assert(
      restoredInnerOpener === "focus-trap-open-inner",
      `Nested FocusTrap restored focus to ${restoredInnerOpener ?? "nothing"}`,
    );
    await page.locator("#focus-trap-close").click();
    await page.waitForFunction(() =>
      document.activeElement?.id === "focus-trap-opener"
    );
    assert(
      await page.locator("[data-headlessui-focus-guard]").count() === 0,
      "FocusTrap guards survived owner disposal",
    );
  }

  await page.evaluate(async () => {
    const browserGlobal = globalThis as typeof globalThis & {
      __disposeHeadlessuiApp: () => void;
    };
    browserGlobal.__disposeHeadlessuiApp();
    await Promise.resolve();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
  });

  const diagnostics = await page.evaluate(() => {
    const browserGlobal = globalThis as typeof globalThis & {
      __headlessuiDiagnostics: () => readonly unknown[];
    };
    return browserGlobal.__headlessuiDiagnostics();
  });
  assert(
    diagnostics.length === 0,
    `Solid diagnostics: ${JSON.stringify(diagnostics)}`,
  );
  assert(
    browserErrors.length === 0,
    `Browser errors: ${browserErrors.join("\n")}`,
  );
  debug(`scenario ${scenario ?? "base"}: assertions passed`);
}

const executable = Deno.env.get("BRAVE_ORIGIN_EXECUTABLE") ??
  DEFAULT_EXECUTABLE;
assert(
  executable !== undefined,
  `No default Brave executable is known for ${Deno.build.os}; set BRAVE_ORIGIN_EXECUTABLE`,
);
assert(
  await Deno.stat(executable).then(() => true, () => false),
  `Missing ${executable}`,
);
assert(
  Number.isFinite(SCENARIO_TIMEOUT) && SCENARIO_TIMEOUT > 0,
  "HEADLESSUI_BRAVE_SCENARIO_TIMEOUT_MS must be a positive number",
);

debug("preparing isolated profile and development fixture build");
await Deno.mkdir(".test-artifacts", { recursive: true });
const profile = await Deno.makeTempDir({
  dir: ".test-artifacts",
  prefix: "brave-",
});
const absoluteProfile = await Deno.realPath(profile);
const fixtureRoot = await Deno.realPath(
  "tests/brave",
);
const siteDirectory = `${absoluteProfile}/site`;
const debuggingPort = reservePort();
const serverPort = reservePort();
const endpoint = `http://127.0.0.1:${debuggingPort}`;
await build({
  base: "/",
  build: { emptyOutDir: true, outDir: siteDirectory },
  configFile: false,
  logLevel: "warn",
  mode: "development",
  plugins: [solid({ dev: true, hot: false })],
  resolve: {
    conditions: ["browser", "development"],
  },
  root: fixtureRoot,
});
debug(
  "development diagnostic fixture build completed; starting preview server",
);
const site = await preview({
  build: { outDir: siteDirectory },
  configFile: false,
  logLevel: "warn",
  preview: { host: "127.0.0.1", port: serverPort, strictPort: true },
  root: fixtureRoot,
});
debug(`preview server listening on ${previewUrl(site)}`);

const brave = new Deno.Command(executable, {
  args: [
    "--headless=new",
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${absoluteProfile}`,
    "--no-first-run",
    "--disable-breakpad",
    "--disable-default-apps",
    "about:blank",
  ],
  stdin: "null",
  stdout: "null",
  stderr: "inherit",
}).spawn();
brave.unref();
debug(`spawned isolated Brave process ${brave.pid}`);

let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
const isolatedBrowserPids = new Set<number>([brave.pid]);
let rememberBrowserProcesses = async () => {};

try {
  const baseUrl = previewUrl(site);
  debug(`waiting for Brave DevTools endpoint ${endpoint}`);
  await waitForEndpoint(`${endpoint}/json/version`);
  debug("Brave DevTools endpoint ready; connecting Playwright");
  browser = await chromium.connectOverCDP(endpoint);
  const browserSession = await browser.newBrowserCDPSession();
  rememberBrowserProcesses = async () => {
    const result = await browserSession.send("SystemInfo.getProcessInfo") as {
      processInfo: { id: number }[];
    };
    for (const process of result.processInfo) {
      if (process.id > 0) isolatedBrowserPids.add(process.id);
    }
  };
  await rememberBrowserProcesses();
  const context = browser.contexts()[0] ?? await browser.newContext();
  const scenarios: Scenario[] = [
    null,
    "boolean",
    "dialog",
    "disclosure",
    "kernel",
    "radio",
    "focus-trap",
    "tabs",
    "touch-mobile",
  ];
  const requestedScenario = Deno.env.get("HEADLESSUI_BRAVE_SCENARIO");
  const selectedScenarios = requestedScenario
    ? scenarios.filter((scenario) => (scenario ?? "base") === requestedScenario)
    : scenarios;
  assert(
    selectedScenarios.length > 0,
    `Unknown HEADLESSUI_BRAVE_SCENARIO=${requestedScenario}`,
  );

  for (const scenario of selectedScenarios) {
    const page = await context.newPage();
    const label = `scenario ${scenario ?? "base"}`;
    debug(`${label}: page opened`);
    try {
      await within(
        runAssertions(page, baseUrl, scenario),
        SCENARIO_TIMEOUT,
        label,
      );
    } catch (error) {
      const diagnostics = await page.evaluate(() => {
        const browserGlobal = globalThis as typeof globalThis & {
          __headlessuiDiagnostics?: () => readonly unknown[];
        };
        return browserGlobal.__headlessuiDiagnostics?.() ?? null;
      }).catch(() => null);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${message}\nSolid diagnostics at failure: ${
          JSON.stringify(diagnostics)
        }`,
        { cause: error },
      );
    } finally {
      await settleWithin(page.close(), 2_000);
    }
  }
  const scenarioSummary = selectedScenarios.length === scenarios.length
    ? "all serialized component and overlay scenarios"
    : selectedScenarios.map((scenario) => scenario ?? "base").join(", ");
  console.log(`Brave: ${scenarioSummary} passed`);
} finally {
  debug("starting browser and preview cleanup");
  await Promise.race([
    rememberBrowserProcesses().catch(() => {}),
    delay(1_000),
  ]);
  if (browser) await settleWithin(browser.close(), 5_000);

  for (const pid of isolatedBrowserPids) {
    try {
      Deno.kill(pid, "SIGTERM");
    } catch {
      // The isolated browser process already exited.
    }
  }
  await settleWithin(brave.status, 2_000);
  for (const pid of isolatedBrowserPids) {
    try {
      Deno.kill(pid, "SIGKILL");
    } catch {
      // Graceful shutdown won the race.
    }
  }
  await settleWithin(brave.status, 2_000);
  await settleWithin(site.close(), 5_000);

  const root = await Deno.realPath(".test-artifacts");
  const resolvedProfile = await Deno.realPath(profile).catch(() =>
    absoluteProfile
  );
  if (resolvedProfile.startsWith(root)) {
    await Deno.remove(profile, { recursive: true }).catch(() => {});
  }
  debug("cleanup completed");
}
