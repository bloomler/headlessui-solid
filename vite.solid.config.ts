import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const entry = "src/index.ts";
const outDir = "dist";
const external = ["@floating-ui/dom", "@solidjs/web", "solid-js"];

export default defineConfig(({ mode }) => {
  const isServerBuild = mode === "solid-server";

  return {
    // `ssr: true` makes the client half hydratable and selects the SSR JSX
    // transform when Vite runs the server build.
    plugins: [solid({ ssr: true })],
    build: isServerBuild
      ? {
        outDir,
        emptyOutDir: false,
        sourcemap: true,
        ssr: entry,
        rolldownOptions: {
          external,
          output: {
            entryFileNames: "index.mjs",
            format: "es",
          },
        },
      }
      : {
        outDir,
        emptyOutDir: true,
        sourcemap: true,
        lib: {
          entry,
          formats: ["es"],
          fileName: () => "index.browser.mjs",
        },
        rolldownOptions: {
          external,
        },
      },
  };
});
