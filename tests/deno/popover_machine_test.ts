import {
  PopoverMachine,
  PopoverStates,
} from "../../src/components/popover/popover-machine.ts";
import { env } from "../../src/utils/env.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("Popover machine opens, closes, and clears demo mode", () => {
  const machine = PopoverMachine.create({ id: "popover", __demoMode: true });
  assert(
    machine.state.popoverState === PopoverStates.Open,
    "Demo did not open",
  );

  machine.actions.close();
  assert(
    Number(machine.state.popoverState) === PopoverStates.Closed,
    "Popover did not close",
  );
  assert(machine.state.__demoMode === false, "Demo mode was not cleared");

  machine.actions.open();
  assert(
    Number(machine.state.popoverState) === PopoverStates.Open,
    "Popover did not reopen",
  );
  machine.dispose();
});

Deno.test("Popover machine registers button and panel identity", () => {
  const machine = PopoverMachine.create({ id: "popover" });
  const button = { tagName: "BUTTON" } as HTMLElement;
  const panel = { tagName: "DIV" } as HTMLElement;

  machine.actions.setButton(button);
  machine.actions.setButtonId("button-id");
  machine.actions.setPanel(panel);
  machine.actions.setPanelId("panel-id");

  assert(machine.state.button === button, "Button identity was lost");
  assert(machine.state.buttonId === "button-id", "Button id was lost");
  assert(machine.state.panel === panel, "Panel identity was lost");
  assert(machine.state.panelId === "panel-id", "Panel id was lost");
  machine.dispose();
});

Deno.test("Popover refocusable close resolves elements, refs, accessors, and fallback", () => {
  const machine = PopoverMachine.create({ id: "popover" });
  const focused: string[] = [];
  const element = (name: string) =>
    ({
      accessKey: "",
      focus: () => focused.push(name),
      nodeType: 1,
      tagName: "BUTTON",
    }) as unknown as HTMLElement;
  const button = element("button");
  const target = element("target");
  machine.actions.setButton(button);

  machine.actions.open();
  machine.actions.refocusableClose(target);
  machine.actions.open();
  machine.actions.refocusableClose({ current: target });
  machine.actions.open();
  machine.actions.refocusableClose(() => target);
  machine.actions.open();
  machine.actions.refocusableClose(new Event("close"));

  assert(
    focused.join(",") === "target,target,target,button",
    `Unexpected focus order: ${focused.join(",")}`,
  );
  assert(
    machine.state.popoverState === PopoverStates.Closed,
    "Refocusable close did not close",
  );
  machine.dispose();
});

Deno.test("Popover portalling heuristic detects split roots and distant focus order", () => {
  env.set("client");
  const machine = PopoverMachine.create({ id: "popover" });
  const panelChild = { tabIndex: 0 } as HTMLElement;
  const before = { tabIndex: 0 } as HTMLElement;
  const after = { tabIndex: 0 } as HTMLElement;
  let roots: Array<{ contains: (candidate: unknown) => boolean }> = [];
  let focusables: HTMLElement[] = [];
  const ownerDocument = {
    documentElement: {},
    querySelectorAll(selector: string) {
      return selector === "body > *" ? roots : focusables;
    },
  } as unknown as Document;
  const button = {
    ownerDocument,
    tabIndex: 0,
  } as HTMLElement;
  const panel = {
    contains: (candidate: unknown) => candidate === panelChild,
  } as HTMLElement;
  try {
    machine.actions.setButton(button);
    machine.actions.setPanel(panel);

    roots = [
      { contains: (candidate) => candidate === button },
      { contains: (candidate) => candidate === panel },
    ];
    assert(
      machine.selectors.isPortalled(machine.state),
      "Split body roots should be portalled",
    );

    roots = [{
      contains: (candidate) => candidate === button || candidate === panel,
    }];
    focusables = [button, panelChild];
    assert(
      !machine.selectors.isPortalled(machine.state),
      "An adjacent panel focusable should preserve native tab order",
    );

    focusables = [before, button, after, panelChild];
    assert(
      machine.selectors.isPortalled(machine.state),
      "Distant panel focusables should use focus sentinels",
    );
  } finally {
    machine.dispose();
    env.reset();
  }
});
