import { type Accessor, createEffect } from "solid-js";
import { type Disposables, disposables } from "../utils/disposables.ts";
import * as DOM from "../utils/dom.ts";
import { isIOS } from "../utils/platform.ts";
import { createIsTopLayer } from "./top-layer.ts";

export type ResolveAllowedContainers = () => readonly HTMLElement[];

interface ScrollLockRecord {
  cleanup: Disposables;
  count: number;
  resolvers: Map<ResolveAllowedContainers, number>;
}

const locks = new Map<Document, ScrollLockRecord>();

function resolvedContainers(record: ScrollLockRecord): HTMLElement[] {
  return [...record.resolvers.keys()].flatMap((resolve) => [...resolve()]);
}

function preventScroll(doc: Document, cleanup: Disposables): void {
  cleanup.style(doc.documentElement, "overflow", "hidden");
}

function prepareScrollbarPadding(
  doc: Document,
  cleanup: Disposables,
): () => void {
  const documentElement = doc.documentElement;
  const ownerWindow = doc.defaultView;
  if (!ownerWindow) return () => {};

  const scrollbarWidthBefore = Math.max(
    0,
    ownerWindow.innerWidth - documentElement.clientWidth,
  );
  return () => {
    const scrollbarWidthAfter = Math.max(
      0,
      documentElement.clientWidth - documentElement.offsetWidth,
    );
    const scrollbarWidth = Math.max(
      0,
      scrollbarWidthBefore - scrollbarWidthAfter,
    );
    cleanup.style(documentElement, "paddingRight", `${scrollbarWidth}px`);
  };
}

function handleIOSLocking(
  doc: Document,
  cleanup: Disposables,
  resolveAllowed: () => readonly HTMLElement[],
): void {
  if (!isIOS()) return;
  const ownerWindow = doc.defaultView;
  if (!ownerWindow) return;

  const inAllowedContainer = (element: Element): boolean =>
    resolveAllowed().some((container) => container.contains(element));

  cleanup.microTask(() => {
    if (
      ownerWindow.getComputedStyle(doc.documentElement).scrollBehavior !==
        "auto"
    ) {
      const smoothScrollCleanup = disposables();
      smoothScrollCleanup.style(doc.documentElement, "scrollBehavior", "auto");
      cleanup.add(() => cleanup.microTask(() => smoothScrollCleanup.dispose()));
    }

    const scrollPosition = ownerWindow.scrollY ?? ownerWindow.pageYOffset;
    let scrollToElement: Element | null = null;

    cleanup.addEventListener(
      doc,
      "click",
      (event) => {
        if (!DOM.isHTMLorSVGElement(event.target)) return;
        try {
          const anchor = event.target.closest("a");
          if (!anchor) return;
          const { hash } = new URL(anchor.href);
          const target = doc.querySelector(hash);
          if (DOM.isHTMLorSVGElement(target) && !inAllowedContainer(target)) {
            scrollToElement = target;
          }
        } catch {
          // Invalid URL/hash selectors cannot be scroll restoration targets.
        }
      },
      true,
    );

    cleanup.group((touchCleanup) => {
      cleanup.addEventListener(doc, "touchstart", (event) => {
        touchCleanup.dispose();
        if (!DOM.isHTMLorSVGElement(event.target)) return;
        if (!DOM.hasInlineStyle(event.target)) return;

        if (inAllowedContainer(event.target)) {
          let rootContainer = event.target;
          while (
            rootContainer.parentElement &&
            inAllowedContainer(rootContainer.parentElement)
          ) {
            rootContainer = rootContainer.parentElement;
          }
          touchCleanup.style(rootContainer, "overscrollBehavior", "contain");
        } else {
          touchCleanup.style(event.target, "touchAction", "none");
        }
      });
    });

    cleanup.addEventListener(
      doc,
      "touchmove",
      (event) => {
        if (!DOM.isHTMLorSVGElement(event.target)) return;
        if (DOM.isHTMLInputElement(event.target)) return;

        if (!inAllowedContainer(event.target)) {
          event.preventDefault();
          return;
        }

        let scrollableParent = event.target;
        while (
          scrollableParent.parentElement &&
          scrollableParent.dataset.headlessuiPortal !== ""
        ) {
          if (
            scrollableParent.scrollHeight > scrollableParent.clientHeight ||
            scrollableParent.scrollWidth > scrollableParent.clientWidth
          ) {
            break;
          }
          scrollableParent = scrollableParent.parentElement;
        }

        if (scrollableParent.dataset.headlessuiPortal === "") {
          event.preventDefault();
        }
      },
      { passive: false },
    );

    cleanup.add(() => {
      const nextPosition = ownerWindow.scrollY ?? ownerWindow.pageYOffset;
      if (scrollPosition !== nextPosition) {
        ownerWindow.scrollTo(0, scrollPosition);
      }
      if (scrollToElement?.isConnected) {
        scrollToElement.scrollIntoView({ block: "nearest" });
      }
      scrollToElement = null;
    });
  });
}

function applyScrollLock(doc: Document, record: ScrollLockRecord): void {
  const resolveAllowed = () => resolvedContainers(record);

  // Preserve the upstream ordering: measure and prepare all steps before
  // applying the compensating styles.
  handleIOSLocking(doc, record.cleanup, resolveAllowed);
  const applyScrollbarPadding = prepareScrollbarPadding(doc, record.cleanup);
  preventScroll(doc, record.cleanup);
  applyScrollbarPadding();
}

export function acquireDocumentScrollLock(
  doc: Document,
  resolveAllowed: ResolveAllowedContainers,
): () => void {
  let record = locks.get(doc);
  if (!record) {
    record = {
      cleanup: disposables(),
      count: 0,
      resolvers: new Map(),
    };
    locks.set(doc, record);
  }

  const resolverCount = record.resolvers.get(resolveAllowed) ?? 0;
  record.resolvers.set(resolveAllowed, resolverCount + 1);
  record.count += 1;
  if (record.count === 1) applyScrollLock(doc, record);

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const current = locks.get(doc);
    if (!current) return;
    const currentResolverCount = current.resolvers.get(resolveAllowed) ?? 1;
    if (currentResolverCount === 1) current.resolvers.delete(resolveAllowed);
    else current.resolvers.set(resolveAllowed, currentResolverCount - 1);
    current.count = Math.max(0, current.count - 1);

    if (current.count !== 0) return;
    current.cleanup.dispose();
    locks.delete(doc);
  };
}

export function createScrollLock(
  enabled: Accessor<boolean>,
  ownerDocument: Accessor<Document | null>,
  resolveAllowedContainers?: ResolveAllowedContainers,
): void {
  const isTopLayer = createIsTopLayer(enabled, "scroll-lock");
  const resolveAllowed = resolveAllowedContainers ?? (() => {
    const body = ownerDocument()?.body;
    return body ? [body] : [];
  });

  createEffect(
    () => isTopLayer() ? ownerDocument() : null,
    (doc) => doc ? acquireDocumentScrollLock(doc, resolveAllowed) : undefined,
  );
}
