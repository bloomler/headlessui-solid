import { render } from "@solidjs/web";
import { createSignal, type Element } from "solid-js";
import { Button } from "@bloomler/headlessui-solid";

function PackageBrowserConsumer(): Element {
  const [clicks, setClicks] = createSignal(0);

  return (
    <main id="package-browser-consumer">
      <Button
        id="package-browser-button"
        onClick={() => setClicks((value) => value + 1)}
      >
        Packaged button
      </Button>
      <output id="package-browser-clicks">{clicks()}</output>
    </main>
  );
}

export function mountPackageBrowserConsumer(element: HTMLElement): {
  dispose(): void;
} {
  const dispose = render(() => <PackageBrowserConsumer />, element);
  return { dispose };
}
