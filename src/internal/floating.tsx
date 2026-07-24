import {
  autoUpdate,
  computePosition,
  flip,
  type Middleware,
  offset,
  shift,
  size,
} from "@floating-ui/dom";
import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  type Element,
  onSettled,
  type ParentProps,
  useContext,
} from "solid-js";
import type { JSX } from "@solidjs/web";
import * as DOM from "../utils/dom.ts";

type Align = "start" | "end";
type Side = "top" | "right" | "bottom" | "left";
export type AnchorTo = `${Side}` | `${Side} ${Align}`;
export type AnchorToWithSelection =
  | AnchorTo
  | "selection"
  | `selection ${Align}`;

interface BaseAnchorProps {
  gap: number | string;
  offset: number | string;
  padding: number | string;
}

export type AnchorProps =
  | false
  | AnchorTo
  | Partial<BaseAnchorProps & { to: AnchorTo }>;

export type AnchorPropsWithSelection =
  | false
  | AnchorToWithSelection
  | Partial<BaseAnchorProps & { to: AnchorToWithSelection }>;

type MaybeAccessor<T> = T | Accessor<T>;
type MaybeRef<T> = MaybeAccessor<T> | { readonly current: T };

export interface FloatingInnerConfig {
  index: MaybeAccessor<number | null | undefined>;
  listRef: MaybeRef<readonly (HTMLElement | null | undefined)[]>;
}

export interface InternalFloatingPanelProps {
  inner?: FloatingInnerConfig;
}

export type FloatingPlacement =
  & Exclude<AnchorPropsWithSelection, boolean | string>
  & InternalFloatingPanelProps;

type FloatingPlacementInput =
  | AnchorPropsWithSelection
  | (
    & Exclude<AnchorPropsWithSelection, boolean | string>
    & InternalFloatingPanelProps
  )
  | null
  | undefined;

interface FloatingContextValue {
  anchor: Accessor<AnchorToWithSelection | undefined>;
  setFloating: (element: HTMLElement | null) => void;
  setReference: (element: HTMLElement | null) => void;
  styles: Accessor<JSX.CSSProperties>;
}

const FloatingContext = createContext<FloatingContextValue>();
const PlacementContext = createContext<
  (value: FloatingPlacement | null) => void
>();

function read<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as Accessor<T>)() : value;
}

function resolveList(
  value: MaybeRef<readonly (HTMLElement | null | undefined)[]>,
): readonly (HTMLElement | null | undefined)[] {
  if (typeof value === "function") return value();
  if (value && typeof value === "object" && "current" in value) {
    return value.current;
  }
  return value;
}

export function resolveAnchor(
  anchor: FloatingPlacementInput,
): FloatingPlacement | null {
  if (!anchor) return null;
  if (typeof anchor === "string") return { to: anchor };
  return anchor;
}

export function useResolvedAnchor<T extends FloatingPlacementInput>(
  anchor?: MaybeAccessor<T>,
): Accessor<FloatingPlacement | null> {
  return () => resolveAnchor(anchor === undefined ? null : read(anchor));
}

export function useFloatingReference(): (element: HTMLElement | null) => void {
  return useContext(FloatingContext).setReference;
}

export function useFloatingReferenceProps(): Record<string, never> {
  return {};
}

export function useFloatingPanelProps(): Record<string, unknown> {
  const context = useContext(FloatingContext);
  return {
    get "data-anchor"(): AnchorToWithSelection | undefined {
      return context.anchor();
    },
  };
}

export function useFloatingPanel(
  placement: MaybeAccessor<FloatingPlacementInput> = null,
): readonly [
  (element: HTMLElement | null) => void,
  Accessor<JSX.CSSProperties>,
] {
  const updatePlacement = useContext(PlacementContext);
  const context = useContext(FloatingContext);
  const resolved = useResolvedAnchor(placement);

  createEffect(
    resolved,
    (value) => {
      updatePlacement(value);
      return () => updatePlacement(null);
    },
  );

  return [
    context.setFloating,
    () => resolved() ? context.styles() : {},
  ] as const;
}

function resolvePxValue(
  value: string | number | undefined,
  element: HTMLElement,
): number {
  if (typeof value === "number") return value;
  if (!value) return 0;

  const temporary = element.ownerDocument.createElement("div");
  temporary.style.setProperty("margin-top", "0px", "important");
  temporary.style.setProperty("margin-top", value, "important");
  element.appendChild(temporary);
  const resolved = parseFloat(
    element.ownerDocument.defaultView?.getComputedStyle(temporary).marginTop ??
      "0",
  ) || 0;
  temporary.remove();
  return resolved;
}

function parsePlacement(value: AnchorToWithSelection | undefined): {
  align: "center" | Align;
  side: Side | "selection";
} {
  const [side = "bottom", align = "center"] = (value ?? "bottom").split(
    " ",
  ) as [Side | "selection", "center" | Align];
  return { align, side };
}

function selectionOffset(config: FloatingInnerConfig): Middleware {
  return {
    name: "headlessui-selection-offset",
    fn(state) {
      const index = read(config.index);
      const item = index == null ? null : resolveList(config.listRef)[index];
      if (!DOM.isHTMLElement(item)) return {};

      return {
        y: state.rects.reference.y + state.rects.reference.height / 2 -
          (item.offsetTop + item.offsetHeight / 2),
      };
    },
  };
}

function exposedPlacement(
  requestedSide: Side | "selection",
  placement: string,
): AnchorToWithSelection {
  const [actualSide, actualAlign] = placement.split("-");
  const side = requestedSide === "selection" ? "selection" : actualSide;
  return [side, actualAlign].filter(Boolean).join(
    " ",
  ) as AnchorToWithSelection;
}

export interface FloatingProviderProps extends ParentProps {
  enabled?: boolean;
}

export function FloatingProvider(props: FloatingProviderProps): Element {
  const [config, setConfig] = createSignal<FloatingPlacement | null>(null, {
    ownedWrite: true,
  });
  const [reference, setReference] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });
  const [floating, setFloating] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });
  const [styles, setStyles] = createSignal<JSX.CSSProperties>({}, {
    ownedWrite: true,
  });
  const [anchor, setAnchor] = createSignal<
    AnchorToWithSelection | undefined
  >(undefined, { ownedWrite: true });

  createEffect(
    () => {
      const placement = config();
      return {
        enabled: (props.enabled ?? true) && placement !== null,
        floating: floating(),
        placement,
        reference: reference(),
      };
    },
    (snapshot) => {
      const floatingElement = snapshot.floating;
      const referenceElement = snapshot.reference;
      const placement = snapshot.placement;

      if (
        !snapshot.enabled || !placement || !floatingElement ||
        !referenceElement
      ) {
        setStyles({});
        setAnchor(undefined);
        return;
      }

      const { align, side } = parsePlacement(placement.to);
      const floatingPlacement = `${side === "selection" ? "bottom" : side}${
        align === "center" ? "" : `-${align}`
      }` as Parameters<typeof computePosition>[2] extends
        { placement?: infer T } ? T : never;
      const originalStyles = {
        maxHeight: floatingElement.style.maxHeight,
        maxWidth: floatingElement.style.maxWidth,
        overflow: floatingElement.style.overflow,
      };
      let disposed = false;

      const update = async () => {
        const gap = resolvePxValue(
          placement.gap ?? "var(--anchor-gap, 0)",
          floatingElement,
        );
        const crossAxis = resolvePxValue(
          placement.offset ?? "var(--anchor-offset, 0)",
          floatingElement,
        );
        const padding = resolvePxValue(
          placement.padding ?? "var(--anchor-padding, 0)",
          floatingElement,
        );
        const middleware: Middleware[] = [
          offset({ mainAxis: side === "selection" ? 0 : gap, crossAxis }),
          shift({ padding }),
        ];
        if (side !== "selection") middleware.push(flip({ padding }));
        if (side === "selection" && placement.inner) {
          middleware.push(selectionOffset(placement.inner));
        }
        middleware.push(
          size({
            padding,
            apply({ availableHeight, availableWidth, elements }) {
              Object.assign(elements.floating.style, {
                maxHeight:
                  `min(var(--anchor-max-height, 100vh), ${availableHeight}px)`,
                maxWidth: `${availableWidth}px`,
                overflow: "auto",
              });
            },
          }),
        );

        const result = await computePosition(
          referenceElement,
          floatingElement,
          {
            middleware,
            placement: floatingPlacement,
            strategy: "absolute",
          },
        );
        if (disposed) return;

        setStyles({
          left: `${result.x}px`,
          position: result.strategy,
          top: `${result.y}px`,
        });
        setAnchor(exposedPlacement(side, result.placement));
      };

      const stop = autoUpdate(referenceElement, floatingElement, update);
      return () => {
        disposed = true;
        stop();
        Object.assign(floatingElement.style, originalStyles);
      };
    },
  );

  onSettled(() => () => {
    setStyles({});
    setAnchor(undefined);
  });

  const context: FloatingContextValue = {
    anchor,
    setFloating,
    setReference,
    styles,
  };

  return (
    <PlacementContext value={setConfig}>
      <FloatingContext value={context}>{props.children}</FloatingContext>
    </PlacementContext>
  );
}
