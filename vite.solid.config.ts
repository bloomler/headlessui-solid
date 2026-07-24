import { defineConfig } from "vite";
import { dts } from "rolldown-plugin-dts";
import solid from "vite-plugin-solid";

const entry = "src/index.ts";
const outDir = "dist";
const external = ["@floating-ui/dom", "@solidjs/web", "solid-js"];

export default defineConfig(({ mode }) => {
  const isServerBuild = mode === "solid-server";

  return {
    // `ssr: true` makes the client half hydratable and selects the SSR JSX
    // transform when Vite runs the server build.
    plugins: [
      solid({ ssr: true }),
      ...isServerBuild ? [] : [
        dts({
          generator: "tsc",
          resolver: "tsc",
          sourcemap: true,
          tsconfig: "tsconfig.types.json",
        }),
      ],
    ],
    oxc: {
      exclude: [/\.js$/, /\.d\.[cm]?ts$/],
    },
    build: isServerBuild
      ? {
        outDir,
        emptyOutDir: false,
        sourcemap: true,
        ssr: entry,
        target: "esnext",
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
        target: "esnext",
        lib: {
          entry,
          formats: ["es"],
          fileName: (_format, entryName) =>
            entryName.endsWith(".d") ? "index.d.ts" : "index.browser.mjs",
        },
        rolldownOptions: {
          external,
        },
      },
  };
});
