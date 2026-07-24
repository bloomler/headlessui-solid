import { renderToString } from "./render-to-string.ts";
import { PackageHydrationFixture } from "./package-hydration-fixture.tsx";

export function renderPackageHydrationFixture(): string {
  return renderToString(() => <PackageHydrationFixture />);
}
