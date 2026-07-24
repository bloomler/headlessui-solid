import { renderToString } from "@solidjs/web";
import { renderElement, RenderFeatures } from "../../src/utils/render.tsx";

interface ChildSlot {
  label: string;
}

export interface RenderChildKindsResult {
  accessorArgumentCounts: number[];
  html: string;
  slotLabel: string | undefined;
}

export function renderChildKinds(): RenderChildKindsResult {
  const accessorArgumentCounts: number[] = [];
  let slotLabel: string | undefined;

  function accessorChild() {
    accessorArgumentCounts.push(arguments.length);
    return <span id="ssr-accessor-child">Accessor child</span>;
  }

  const html = renderToString(() => (
    <>
      {renderElement({
        defaultTag: "section",
        name: "AccessorFixture",
        ourProps: { id: "ssr-accessor-kernel" },
        slot: { label: "accessor-slot" },
        theirProps: { children: accessorChild },
      })}
      {renderElement({
        defaultTag: "section",
        name: "SlotFixture",
        ourProps: { id: "ssr-slot-kernel" },
        slot: { label: "slot-value" },
        theirProps: {
          children(slot: ChildSlot) {
            slotLabel = slot.label;
            return <span id="ssr-slot-child">{slot.label}</span>;
          },
        },
      })}
    </>
  ));

  return { accessorArgumentCounts, html, slotLabel };
}

export function renderStaticContent(): string {
  return renderToString(() =>
    renderElement({
      defaultTag: "div",
      features: RenderFeatures.RenderStrategy | RenderFeatures.Static,
      name: "StaticFixture",
      ourProps: {},
      slot: {},
      theirProps: { id: "static-content", static: true, children: "Static" },
      visible: false,
    })
  );
}

export function renderRetainedContent(): string {
  return renderToString(() =>
    renderElement({
      defaultTag: "div",
      features: RenderFeatures.RenderStrategy | RenderFeatures.Static,
      name: "RetainedFixture",
      ourProps: {},
      slot: {},
      theirProps: {
        id: "retained-content",
        unmount: false,
        children: "Retained",
      },
      visible: false,
    })
  );
}

export function renderUnmountedContent(): string {
  return renderToString(() =>
    renderElement({
      defaultTag: "div",
      features: RenderFeatures.RenderStrategy | RenderFeatures.Static,
      name: "UnmountedFixture",
      ourProps: {},
      slot: {},
      theirProps: { id: "unmounted-content", children: "Unmounted" },
      visible: false,
    })
  );
}
