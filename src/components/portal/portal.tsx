import {
  type Accessor,
  type Component,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  type Element,
  omit,
  onSettled,
  type ParentComponent,
  Show,
  useContext,
} from "solid-js";
import {
  isServer,
  Portal as SolidPortal,
  type ValidComponent,
} from "@solidjs/web";
import { usePortalRoot } from "../../internal/portal-force-root.tsx";
import type { Props, Ref } from "../../types.ts";
import { renderElement } from "../../utils/render.tsx";

const PORTAL_ROOT_ID = "headlessui-portal-root";

const Transparent: Component<{ children?: Element }> = (props) => (
  <>{props.children}</>
);

type PortalRenderPropArg = Record<never, never>;
type PortalTarget = HTMLElement | null | Accessor<HTMLElement | null>;

/**
 * Props accepted by the portal component.
 */
export type PortalProps<
  TTag extends ValidComponent = typeof Transparent,
> = Props<
  TTag,
  PortalRenderPropArg,
  never,
  {
    enabled?: boolean;
    ownerDocument?: Document | null;
  },
  HTMLElement
>;

export type PortalGroupProps<
  TTag extends ValidComponent = typeof Transparent,
> = Props<
  TTag,
  PortalRenderPropArg,
  never,
  { target: PortalTarget },
  HTMLElement
>;

interface PortalRootRecord {
  count: number;
  element: HTMLElement;
  observer?: MutationObserver;
}

interface PortalRootLease {
  element: HTMLElement;
  release: () => void;
}

const portalRoots = new WeakMap<Document, PortalRootRecord>();

function acquirePortalRoot(ownerDocument: Document): PortalRootLease | null {
  const body = ownerDocument.body;
  if (!body) return null;

  let record = portalRoots.get(ownerDocument);

  if (!record) {
    const existing = ownerDocument.getElementById(PORTAL_ROOT_ID);
    const element = existing ?? ownerDocument.createElement("div");

    element.id = PORTAL_ROOT_ID;
    record = { count: 0, element };
    portalRoots.set(ownerDocument, record);
  }

  record.observer?.disconnect();
  record.observer = undefined;
  if (!body.contains(record.element)) body.append(record.element);
  record.count += 1;

  let released = false;

  return {
    element: record.element,
    release() {
      if (released) return;
      released = true;
      record.count = Math.max(0, record.count - 1);

      const removeIfUnused = (): boolean => {
        if (record.count !== 0) {
          record.observer?.disconnect();
          record.observer = undefined;
          return true;
        }
        if (record.element.childNodes.length !== 0) return false;

        record.observer?.disconnect();
        record.observer = undefined;
        record.element.remove();
        if (portalRoots.get(ownerDocument) === record) {
          portalRoots.delete(ownerDocument);
        }
        return true;
      };

      queueMicrotask(() => {
        if (removeIfUnused()) return;

        // A reactive Portal target can move its range on the following flush.
        // Observe that final removal instead of leaking an empty managed root.
        record.observer?.disconnect();
        record.observer = new MutationObserver(removeIfUnused);
        record.observer.observe(record.element, { childList: true });
      });
    },
  };
}

function resolveTarget(target: PortalTarget): HTMLElement | null {
  return typeof target === "function" ? target() : target;
}

const PortalGroupContext = createContext<Accessor<HTMLElement | null> | null>(
  null,
);

interface PortalParentContextValue {
  register: (portal: HTMLElement) => () => void;
  unregister: (portal: HTMLElement) => void;
}

const PortalParentContext = createContext<PortalParentContextValue | null>(
  null,
);

function PortalContent<TTag extends ValidComponent>(
  props: PortalProps<TTag>,
): Element {
  const theirProps = omit(props, "enabled", "ownerDocument", "ref");
  const ourProps = {
    get ref(): Ref<HTMLElement> | undefined {
      return props.ref;
    },
  };

  return renderElement({
    defaultTag: Transparent,
    name: "Portal",
    ourProps,
    slot: {},
    theirProps,
  });
}

function PortalContainer(props: { children?: Element }): Element {
  const parent = useContext(PortalParentContext);
  let element: HTMLDivElement | undefined;

  onSettled(() => {
    if (!parent || !element) return;
    return parent.register(element);
  });

  return (
    <div data-headlessui-portal="" ref={element}>
      {props.children}
    </div>
  );
}

function InternalPortal(props: {
  children?: Element;
  ownerDocument?: Document | null;
}): Element {
  if (isServer) return undefined;

  const forceRoot = usePortalRoot();
  const groupTarget = useContext(PortalGroupContext);
  const [target, setTarget] = createSignal<HTMLElement | null>(null);
  type TargetRequest =
    | { kind: "group"; target: HTMLElement | null }
    | { kind: "root"; ownerDocument: Document };
  const targetRequest = createMemo<TargetRequest>(
    () => {
      if (!forceRoot() && groupTarget !== null) {
        return { kind: "group", target: groupTarget() };
      }

      return {
        kind: "root",
        ownerDocument: props.ownerDocument ?? document,
      };
    },
    {
      equals(previous, next) {
        if (previous.kind !== next.kind) return false;
        return previous.kind === "group" && next.kind === "group"
          ? previous.target === next.target
          : previous.kind === "root" && next.kind === "root" &&
            previous.ownerDocument === next.ownerDocument;
      },
    },
  );
  createEffect(
    targetRequest,
    (state) => {
      let lease: PortalRootLease | null = null;
      const nextTarget = state.kind === "group"
        ? state.target
        : (lease = acquirePortalRoot(state.ownerDocument))?.element ?? null;
      let cancelled = false;

      // A target write can synchronously materialize the Portal subtree. Keep
      // that component work out of this effect's deliberately untracked apply
      // callback so ordinary component initialization is not misclassified as
      // an untracked effect read by Solid 2 diagnostics.
      queueMicrotask(() => {
        if (!cancelled) setTarget(nextTarget);
      });

      return () => {
        cancelled = true;
        lease?.release();
      };
    },
  );

  return (
    <Show when={target()} keyed>
      {(mount) => (
        <SolidPortal mount={mount}>
          <PortalContainer>{props.children}</PortalContainer>
        </SolidPortal>
      )}
    </Show>
  );
}

function PortalRoot<TTag extends ValidComponent = typeof Transparent>(
  props: PortalProps<TTag>,
): Element {
  const enabled = () => props.enabled ?? true;

  return (
    <Show when={enabled()} fallback={<PortalContent {...props} />}>
      <InternalPortal ownerDocument={props.ownerDocument}>
        <PortalContent {...props} />
      </InternalPortal>
    </Show>
  );
}

export function PortalGroup<
  TTag extends ValidComponent = typeof Transparent,
>(props: PortalGroupProps<TTag>): Element {
  const target = () => resolveTarget(props.target);
  const theirProps = omit(props, "target", "ref");
  const ourProps = {
    get ref(): Ref<HTMLElement> | undefined {
      return props.ref;
    },
  };

  return (
    <PortalGroupContext value={target}>
      {renderElement({
        defaultTag: Transparent,
        name: "Portal.Group",
        ourProps,
        slot: {},
        theirProps,
      })}
    </PortalGroupContext>
  );
}

export function useNestedPortals(): readonly [
  Accessor<readonly HTMLElement[]>,
  ParentComponent,
] {
  const parent = useContext(PortalParentContext);
  const [portals, setPortals] = createSignal<readonly HTMLElement[]>([], {
    ownedWrite: true,
  });
  const registered = new Set<HTMLElement>();

  const unregister = (portal: HTMLElement) => {
    if (!registered.delete(portal)) return;
    setPortals((current) => current.filter((item) => item !== portal));
    parent?.unregister(portal);
  };

  const register = (portal: HTMLElement) => {
    if (registered.has(portal)) return () => unregister(portal);

    registered.add(portal);
    setPortals((current) => [...current, portal]);
    parent?.register(portal);
    return () => unregister(portal);
  };

  const api: PortalParentContextValue = { register, unregister };
  const PortalWrapper: ParentComponent = (wrapperProps) => (
    <PortalParentContext value={api}>
      {wrapperProps.children}
    </PortalParentContext>
  );

  return [portals, PortalWrapper] as const;
}

/**
 * Renders the accessible, unstyled portal component for Solid.
 */
export const Portal: typeof PortalRoot & {
  Group: typeof PortalGroup;
} = Object.assign(PortalRoot, {
  /** @deprecated Use the module-internal `PortalGroup` component directly. */
  Group: PortalGroup,
});
