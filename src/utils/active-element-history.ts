import { onDocumentReady } from "./document-ready.ts";
import * as DOM from "./dom.ts";
import { focusableSelector } from "./focus-management.ts";

export let history: (HTMLOrSVGElement & Element)[] = [];

onDocumentReady(() => {
  const ownerWindow = document.defaultView;
  if (!ownerWindow) return;

  function handle(event: Event): void {
    if (!DOM.isHTMLorSVGElement(event.target)) return;
    if (event.target === document.body) return;
    if (history[0] === event.target) return;

    // A pointer event can originate in a non-focusable descendant of the
    // element that ultimately receives focus.
    const focusableElement = event.target.closest(focusableSelector);
    history.unshift(
      DOM.isHTMLorSVGElement(focusableElement)
        ? focusableElement
        : event.target,
    );

    history = history.filter((element) => element.isConnected);
    history.splice(10);
  }

  ownerWindow.addEventListener("click", handle, { capture: true });
  ownerWindow.addEventListener("mousedown", handle, { capture: true });
  ownerWindow.addEventListener("focus", handle, { capture: true });

  document.body.addEventListener("click", handle, { capture: true });
  document.body.addEventListener("mousedown", handle, { capture: true });
  document.body.addEventListener("focus", handle, { capture: true });
});
