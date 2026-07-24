import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

const defaultBraveExecutable = Deno.build.os === "windows"
  ? "C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe"
  : Deno.build.os === "linux"
  ? "/usr/bin/brave-browser"
  : undefined;
const braveExecutable = Deno.env.get("BRAVE_ORIGIN_EXECUTABLE") ??
  defaultBraveExecutable;

if (braveExecutable === undefined) {
  throw new Error(
    `No default Brave executable is known for ${Deno.build.os}; set BRAVE_ORIGIN_EXECUTABLE`,
  );
}

export default defineConfig({
  plugins: [solid()],
  test: {
    // Brave is intentionally serialized. On Windows, allowing Vitest
    // to size its browser worker pool from the host CPU count can fan out into
    // dozens of Deno workers before collection and exhaust pipe handles.
    fileParallelism: false,
    // DOM suites deliberately use JSDOM-only observer/layout mocks and include
    // runtime-throw safeguards that halt Solid's DEV scheduler. They run under
    // vitest.solid.dom.config.ts; this native matrix owns browser tests only.
    include: ["tests/**/*.browser.test.tsx"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {
          executablePath: braveExecutable,
        },
      }),
      instances: [{ browser: "chromium" }],
    },
    maxWorkers: 1,
    sequence: {
      hooks: "stack",
    },
    setupFiles: [
      "tests/solid-dev-diagnostics.setup.ts",
    ],
  },
});
