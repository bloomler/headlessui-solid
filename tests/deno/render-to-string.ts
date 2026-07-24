import { renderToString as solidRenderToString } from "@solidjs/web";
import type { Element } from "solid-js";

export function renderToString(view: () => Element): string {
  // Solid 2's server runtime does not expose DEV diagnostics.
  // Keep SSR rendering honest instead of treating an unavailable capture as
  // an empty diagnostic result.
  return solidRenderToString(view);
}
