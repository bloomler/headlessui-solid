import { renderToString } from "@solidjs/web";
import { CloseButton } from "../../src/components/close-button/close-button.tsx";

export function renderCloseButton(): string {
  return renderToString(() => (
    <CloseButton id="close" class="trigger">
      Close
    </CloseButton>
  ));
}
