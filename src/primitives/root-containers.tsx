import {
  type Accessor,
  createContext,
  createSignal,
  type Element as SolidElement,
  onSettled,
  Show,
  untrack,
  useContext,
} from "solid-js";
import { Hidden, HiddenFeatures } from "../internal/hidden.tsx";
import * as DOM from "../utils/dom.ts";
import { getOwnerDocument } from "../utils/owner.ts";

type MaybeAccessor<T> = T | Accessor<T>;
type ElementRef = { readonly current: Element | null | undefined };
type DefaultContainer = Element | ElementRef | null | undefined;

export interface RootContainersOptions {
  defaultContainers?: MaybeAccessor<readonly DefaultContainer[]>;
  mainTreeNode?: MaybeAccessor<Element | null | undefined>;
  portals?: MaybeAccessor<readonly Element[]>;
}

function read<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as Accessor<T>)() : value;
}

function resolveElement(container: DefaultContainer): Element | null {
  if (DOM.isElement(container)) return container;
  if (container && "current" in container && DOM.isElement(container.current)) {
    return container.current;
  }
  return null;
}

export function createRootContainers(options: RootContainersOptions = {}) {
  const resolveContainers = (): Element[] => {
    const mainTreeNode = options.mainTreeNode
      ? read(options.mainTreeNode) ?? null
      : null;
    const ownerDocument = getOwnerDocument(mainTreeNode);
    const containers: Element[] = [];

    for (
      const candidate of options.defaultContainers
        ? read(options.defaultContainers)
        : []
    ) {
      const container = resolveElement(candidate);
      if (container) containers.push(container);
    }

    for (const portal of options.portals ? read(options.portals) : []) {
      if (!containers.includes(portal)) containers.push(portal);
    }

    for (
      const container of ownerDocument?.querySelectorAll(
        "html > *, body > *",
      ) ?? []
    ) {
      if (container === ownerDocument?.body) continue;
      if (container === ownerDocument?.head) continue;
      if (!DOM.isElement(container)) continue;
      if (container.id === "headlessui-portal-root") continue;

      if (mainTreeNode) {
        if (container.contains(mainTreeNode)) continue;
        const root = mainTreeNode.getRootNode();
        const host = "host" in root ? root.host : null;
        if (DOM.isElement(host) && container.contains(host)) continue;
      }

      if (containers.some((known) => container.contains(known))) continue;
      containers.push(container);
    }

    return containers;
  };

  return {
    resolveContainers,
    contains(element: Element): boolean {
      return resolveContainers().some((container) =>
        container.contains(element)
      );
    },
  };
}

const MainTreeContext = createContext<Accessor<Element | null> | null>(null);

export interface MainTreeProviderProps {
  children?: SolidElement;
  node?: MaybeAccessor<Element | null | undefined>;
}

/**
 * Captures the application tree that exists outside a Portal. Overlay
 * primitives use it to distinguish third-party roots from the app root.
 */
export function MainTreeProvider(props: MainTreeProviderProps): SolidElement {
  const parent = useContext(MainTreeContext);

  // A nested provider always preferred the inherited node, so introducing a
  // second lazy Context projection could not change the value. Return the
  // existing owned child directly and avoid rebuilding nested overlay trees.
  if (parent !== null) return untrack(() => props.children);

  const [discoveredNode, setDiscoveredNode] = createSignal<Element | null>(
    null,
    { ownedWrite: true },
  );
  const resolvedNode = (): Element | null => {
    const explicitNode = props.node === undefined
      ? null
      : read(props.node) ?? null;
    return explicitNode ?? discoveredNode();
  };

  const discoverMainTree = (marker: HTMLElement) => {
    const ownerDocument = getOwnerDocument(marker);
    for (
      const container of ownerDocument?.querySelectorAll(
        "html > *, body > *",
      ) ?? []
    ) {
      if (container === ownerDocument?.body) continue;
      if (container === ownerDocument?.head) continue;
      if (!DOM.isElement(container)) continue;
      if (!container.contains(marker)) continue;

      setDiscoveredNode(container);
      break;
    }
  };
  let marker: HTMLElement | undefined;

  // Solid invokes refs before a cloned template node is connected. Discover
  // the containing application root after the initial DOM work has settled.
  onSettled(() => {
    if (marker) discoverMainTree(marker);
  });

  return (
    <MainTreeContext value={resolvedNode}>
      {props.children}
      <Show when={resolvedNode() === null}>
        <Hidden
          features={HiddenFeatures.Hidden}
          ref={marker}
        />
      </Show>
    </MainTreeContext>
  );
}

export function useMainTreeNode(
  fallback: MaybeAccessor<Element | null | undefined> = null,
): Accessor<Element | null> {
  const context = useContext(MainTreeContext);
  return () => context?.() ?? read(fallback) ?? null;
}
