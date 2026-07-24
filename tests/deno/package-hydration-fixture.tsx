import { createSignal, type Element } from "solid-js";
import {
  Button,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@bloomler/headlessui-solid";

export function PackageHydrationFixture(): Element {
  const [clicks, setClicks] = createSignal(0);

  return (
    <main
      data-package-hydration-node="shell"
      id="package-hydration-consumer"
    >
      <Button
        data-package-hydration-node="counter"
        id="package-hydration-counter"
        onClick={() => setClicks((value) => value + 1)}
      >
        Increment packaged counter
      </Button>
      <output id="package-hydration-clicks">{clicks()}</output>

      <Disclosure
        as="section"
        data-package-hydration-node="disclosure"
        defaultOpen
      >
        {(slot) => (
          <>
            <output id="package-hydration-disclosure-state">
              {slot.open ? "open" : "closed"}
            </output>
            <DisclosureButton data-package-hydration-node="disclosure-button">
              Toggle packaged disclosure
            </DisclosureButton>
            <DisclosurePanel data-package-hydration-node="disclosure-panel">
              Packaged disclosure contents
            </DisclosurePanel>
          </>
        )}
      </Disclosure>
    </main>
  );
}
