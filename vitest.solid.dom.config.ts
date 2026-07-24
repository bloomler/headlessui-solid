import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        pretendToBeVisual: true,
      },
    },
    fileParallelism: false,
    globals: true,
    include: ["tests/**/*.dom.test.tsx"],
    maxWorkers: 1,
    sequence: {
      hooks: "stack",
    },
    setupFiles: [
      "tests/solid-dev-diagnostics.setup.ts",
    ],
  },
});
