import { renderToString } from "@solidjs/web";
import { Button } from "../../src/index.ts";

export function renderDefaultButton(): string {
  return renderToString(() => (
    <Button class={(slot) => ({ disabled: slot.disabled })}>
      {(slot) =>
        slot.disabled ? "Unavailable" : "Ready"}
    </Button>
  ));
}

export function renderDisabledButton(): string {
  return renderToString(() => (
    <Button autofocus disabled>
      Disabled
    </Button>
  ));
}

export function renderAnchorButton(): string {
  return renderToString(() => <Button as="a" href="/account">Account</Button>);
}
