import { type JSX, render } from "@solidjs/web";
import { DEV, type Element as SolidElement, flush } from "solid-js";
import { afterEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";

type InputKey = "a" | "Enter" | "Space" | "Tab";
type CancelPoint = "blur" | "keydown" | "keypress" | "keyup";

interface ExpectedEvent {
  target: "after" | "before" | "trigger";
  type: "click" | "focusin" | "focusout" | "keydown" | "keypress" | "keyup";
}

interface InteractionRow {
  cancel?: CancelPoint;
  expected: ExpectedEvent[];
  id: number;
  key: InputKey;
  name: string;
  shift?: boolean;
}

const at = (
  type: ExpectedEvent["type"],
  target: ExpectedEvent["target"] = "trigger",
): ExpectedEvent => ({ target, type });

const tabSequence = (
  target: "after" | "before",
): ExpectedEvent[] => [
  at("keydown"),
  at("focusout"),
  at("focusin", target),
  at("keyup", target),
];

const rows: InteractionRow[] = [
  {
    expected: [at("keydown"), at("keypress"), at("keyup")],
    id: 1,
    key: "a",
    name: "default letter",
  },
  {
    expected: [
      at("keydown"),
      at("keypress"),
      at("keyup"),
      at("click"),
    ],
    id: 2,
    key: "Space",
    name: "default Space",
  },
  {
    expected: [
      at("keydown"),
      at("keypress"),
      at("click"),
      at("keyup"),
    ],
    id: 3,
    key: "Enter",
    name: "default Enter",
  },
  {
    expected: tabSequence("after"),
    id: 4,
    key: "Tab",
    name: "default Tab",
  },
  {
    expected: tabSequence("before"),
    id: 5,
    key: "Tab",
    name: "default Shift+Tab",
    shift: true,
  },
  {
    cancel: "keydown",
    expected: [at("keydown"), at("keyup")],
    id: 6,
    key: "a",
    name: "cancel keydown for letter",
  },
  {
    cancel: "keydown",
    expected: [at("keydown"), at("keyup")],
    id: 7,
    key: "Space",
    name: "cancel keydown for Space",
  },
  {
    cancel: "keydown",
    expected: [at("keydown"), at("keyup")],
    id: 8,
    key: "Enter",
    name: "cancel keydown for Enter",
  },
  {
    cancel: "keydown",
    expected: [at("keydown"), at("keyup")],
    id: 9,
    key: "Tab",
    name: "cancel keydown for Tab",
  },
  {
    cancel: "keydown",
    expected: [at("keydown"), at("keyup")],
    id: 10,
    key: "Tab",
    name: "cancel keydown for Shift+Tab",
    shift: true,
  },
  {
    cancel: "keypress",
    expected: [at("keydown"), at("keypress"), at("keyup")],
    id: 11,
    key: "a",
    name: "cancel keypress for letter",
  },
  {
    cancel: "keypress",
    expected: [
      at("keydown"),
      at("keypress"),
      at("keyup"),
      at("click"),
    ],
    id: 12,
    key: "Space",
    name: "cancel keypress for Space",
  },
  {
    cancel: "keypress",
    expected: [at("keydown"), at("keypress"), at("keyup")],
    id: 13,
    key: "Enter",
    name: "cancel keypress for Enter",
  },
  {
    cancel: "keypress",
    expected: tabSequence("after"),
    id: 14,
    key: "Tab",
    name: "cancel keypress for Tab",
  },
  {
    cancel: "keypress",
    expected: tabSequence("before"),
    id: 15,
    key: "Tab",
    name: "cancel keypress for Shift+Tab",
    shift: true,
  },
  {
    cancel: "keyup",
    expected: [at("keydown"), at("keypress"), at("keyup")],
    id: 16,
    key: "a",
    name: "cancel keyup for letter",
  },
  {
    cancel: "keyup",
    expected: [at("keydown"), at("keypress"), at("keyup")],
    id: 17,
    key: "Space",
    name: "cancel keyup for Space",
  },
  {
    cancel: "keyup",
    expected: [
      at("keydown"),
      at("keypress"),
      at("click"),
      at("keyup"),
    ],
    id: 18,
    key: "Enter",
    name: "cancel keyup for Enter",
  },
  {
    cancel: "keyup",
    expected: tabSequence("after"),
    id: 19,
    key: "Tab",
    name: "cancel keyup for Tab",
  },
  {
    cancel: "keyup",
    expected: tabSequence("before"),
    id: 20,
    key: "Tab",
    name: "cancel keyup for Shift+Tab",
    shift: true,
  },
  {
    cancel: "blur",
    expected: tabSequence("after"),
    id: 21,
    key: "Tab",
    name: "cancel blur for Tab",
  },
  {
    cancel: "blur",
    expected: tabSequence("before"),
    id: 22,
    key: "Tab",
    name: "cancel blur for Shift+Tab",
    shift: true,
  },
];

let dispose: (() => void) | undefined;
let host: HTMLDivElement | undefined;

function mount(view: () => SolidElement): void {
  host = document.createElement("div");
  host.id = "interaction-parity-host";
  document.body.append(host);
  dispose = render(view, host);
  flush();
}

async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

afterEach(async () => {
  dispose?.();
  dispose = undefined;
  await settle();
  host?.remove();
  host = undefined;
  document.body.replaceChildren();
});

test.each(rows)("native interaction row $id: $name", async (row) => {
  const diagnostics = DEV?.diagnostics.capture();
  const fired: ExpectedEvent[] = [];
  let capturing = false;

  const handlers = (): JSX.ButtonHTMLAttributes<HTMLButtonElement> => ({
    onClick(event) {
      if (!capturing) return;
      fired.push({
        target: (event.target as HTMLElement).id as ExpectedEvent["target"],
        type: "click",
      });
    },
    onFocusIn(event) {
      if (!capturing) return;
      fired.push({
        target: (event.target as HTMLElement).id as ExpectedEvent["target"],
        type: "focusin",
      });
    },
    onFocusOut(event) {
      if (!capturing) return;
      if (row.cancel === "blur") event.preventDefault();
      fired.push({
        target: (event.target as HTMLElement).id as ExpectedEvent["target"],
        type: "focusout",
      });
    },
    onKeyDown(event) {
      if (!capturing) return;
      // Vitest's real-browser Shift+Tab helper emits the physical Shift key
      // pair as well. The upstream `shift(Keys.Tab)` helper models one Tab
      // event carrying shiftKey, so compare that shared semantic event only.
      if (event.key === "Shift") return;
      if (row.cancel === "keydown") event.preventDefault();
      fired.push({
        target: (event.target as HTMLElement).id as ExpectedEvent["target"],
        type: "keydown",
      });
    },
    onKeyPress(event) {
      if (!capturing) return;
      if (event.key === "Shift") return;
      if (row.cancel === "keypress") event.preventDefault();
      fired.push({
        target: (event.target as HTMLElement).id as ExpectedEvent["target"],
        type: "keypress",
      });
    },
    onKeyUp(event) {
      if (!capturing) return;
      if (event.key === "Shift") return;
      if (row.cancel === "keyup") event.preventDefault();
      fired.push({
        target: (event.target as HTMLElement).id as ExpectedEvent["target"],
        type: "keyup",
      });
    },
  });

  mount(() => (
    <>
      <button id="before" type="button" {...handlers()}>Before</button>
      <button id="trigger" type="button" {...handlers()}>Trigger</button>
      <button id="after" type="button" {...handlers()}>After</button>
    </>
  ));
  await settle();
  document.getElementById("trigger")!.focus();
  await settle();
  capturing = true;

  if (row.key === "Tab") {
    await userEvent.tab({ shift: row.shift ?? false });
  } else if (row.key === "Space") {
    await userEvent.keyboard("{Space}");
  } else if (row.key === "Enter") {
    await userEvent.keyboard("{Enter}");
  } else {
    await userEvent.keyboard(row.key);
  }
  await settle();

  expect(fired).toEqual(row.expected);
  expect(diagnostics?.stop() ?? []).toEqual([]);
});
