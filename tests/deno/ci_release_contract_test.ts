function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface NpmManifest {
  dependencies?: Record<string, string>;
  exports?: {
    ".": Record<string, string>;
  };
  files?: string[];
  name?: string;
  peerDependencies?: Record<string, string>;
  publishConfig?: {
    access?: string;
    registry?: string;
  };
  version?: string;
}

interface DenoManifest {
  exports?: string;
  lock?: {
    frozen?: boolean;
    path?: string;
  };
  name?: string;
  publish?: {
    include?: string[];
  };
  tasks: Record<string, string>;
  version?: string;
}

Deno.test("CI and release run the complete Solid package gate", async () => {
  for (
    const workflow of [
      ".github/workflows/ci.yml",
      ".github/workflows/publish.yml",
    ]
  ) {
    const source = await Deno.readTextFile(workflow);
    assert(
      source.includes("deno task verify:all"),
      `${workflow} does not run the complete Solid gate`,
    );
    assert(
      source.includes("apt-get install --yes brave-browser"),
      `${workflow} does not install Brave on Linux`,
    );
    assert(
      source.includes("BRAVE_ORIGIN_EXECUTABLE: /usr/bin/brave-browser"),
      `${workflow} does not route browser tests to Brave`,
    );
  }

  const publish = await Deno.readTextFile(".github/workflows/publish.yml");
  const verifyIndex = publish.indexOf("deno task verify:all");
  const npmDryRunIndex = publish.indexOf("npm publish --dry-run");
  const jsrDryRunIndex = publish.indexOf("deno publish --dry-run");
  const npmPublishIndex = publish.indexOf("npm publish --tag");
  const jsrPublishIndex = publish.lastIndexOf("deno publish --allow-dirty");
  assert(
    verifyIndex >= 0 &&
      npmDryRunIndex > verifyIndex &&
      jsrDryRunIndex > verifyIndex &&
      npmPublishIndex > npmDryRunIndex &&
      npmPublishIndex > jsrDryRunIndex &&
      jsrPublishIndex > npmPublishIndex,
    "Publish workflow does not verify and dry-run both registries before publishing",
  );
  assert(
    publish.includes("id-token: write") &&
      !publish.includes("NODE_AUTH_TOKEN"),
    "Publish workflow does not use tokenless OIDC",
  );
  assert(
    publish.includes("id: npm_release") &&
      publish.includes(
        "if: steps.npm_release.outputs.published != 'true'",
      ),
    "Publish workflow cannot resume after NPM succeeds and JSR fails",
  );
});

Deno.test("NPM and JSR manifests describe the same public release", async () => {
  const npm = JSON.parse(
    await Deno.readTextFile("package.json"),
  ) as NpmManifest;
  const deno = JSON.parse(
    await Deno.readTextFile("deno.json"),
  ) as DenoManifest;

  assert(
    npm.name === "@bloomler/headlessui-solid",
    "Unexpected NPM package name",
  );
  assert(
    deno.name === "@bloomler/headlessui-solid",
    "Unexpected JSR package name",
  );
  assert(
    npm.version === "0.1.0-beta.1" && npm.version === deno.version,
    "NPM and JSR release versions differ",
  );
  assert(deno.exports === "./src/index.ts", "JSR does not export source");
  assert(
    deno.lock?.frozen === true && deno.lock.path === "./deno.lock",
    "The root Deno lockfile is not frozen",
  );
  assert(
    npm.publishConfig?.access === "public" &&
      npm.publishConfig.registry === "https://registry.npmjs.org/",
    "NPM publication is not pinned to the public registry",
  );
  assert(
    npm.dependencies?.["@floating-ui/dom"] === "1.8.0",
    "Floating UI runtime is not pinned",
  );
  for (const peer of ["@solidjs/web", "solid-js"]) {
    assert(
      npm.peerDependencies?.[peer] === ">=2.0.0-beta.25 <3.0.0",
      `${peer} does not allow the supported SolidJS 2 release line`,
    );
  }

  const entry = npm.exports?.["."];
  assert(entry?.types === "./src/index.ts", "NPM types do not target source");
  assert(
    entry?.browser === "./dist/index.browser.mjs" &&
      entry.import === "./dist/index.browser.mjs" &&
      entry.default === "./dist/index.browser.mjs",
    "NPM browser conditions do not target the browser build",
  );
  for (const condition of ["deno", "node", "worker"]) {
    assert(
      entry?.[condition] === "./dist/index.mjs",
      `NPM ${condition} condition does not target the server build`,
    );
  }

  for (
    const file of [
      "CHANGELOG.md",
      "LICENSE",
      "NOTICE.md",
      "README.md",
    ]
  ) {
    assert(npm.files?.includes(file), `NPM package omits ${file}`);
    assert(
      deno.publish?.include?.includes(file),
      `JSR package omits ${file}`,
    );
    assert((await Deno.stat(file)).isFile, `Repository is missing ${file}`);
  }

  const changelog = await Deno.readTextFile("CHANGELOG.md");
  assert(
    changelog.includes(`## [${npm.version}] - `),
    "Changelog does not contain the release version",
  );
  assert(
    deno.tasks.verify.includes("deno task audit") &&
      deno.tasks.verify.includes("deno task check:package") &&
      deno.tasks.verify.includes("deno task check:jsr-score") &&
      deno.tasks.verify.includes("deno task publish:jsr:check"),
    "Standard verification bypasses package checks",
  );
  assert(
    deno.tasks["verify:all"].includes("deno task test:browser") &&
      deno.tasks["verify:all"].includes("deno task test:browser:vitest"),
    "Complete verification bypasses a browser lane",
  );
});

Deno.test("the standalone port contains no upstream package trees", async () => {
  for (
    const removed of [
      "jest",
      "packages",
      "playgrounds",
      "spikes",
      "package-lock.json",
    ]
  ) {
    try {
      await Deno.lstat(removed);
      throw new Error(`Legacy path still exists: ${removed}`);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) continue;
      throw error;
    }
  }
});

Deno.test("native Brave runners use OS-aware executable defaults", async () => {
  for (
    const runner of [
      "scripts/brave-origin.ts",
      "vitest.solid.browser.config.ts",
    ]
  ) {
    const source = await Deno.readTextFile(runner);
    assert(
      source.includes('Deno.build.os === "windows"') &&
        source.includes(
          String
            .raw`C:\\Program Files\\BraveSoftware\\Brave-Origin\\Application\\brave.exe`,
        ),
      `${runner} does not default to Brave Origin on Windows`,
    );
    assert(
      source.includes('Deno.build.os === "linux"') &&
        source.includes('"/usr/bin/brave-browser"'),
      `${runner} does not default to Brave on Linux`,
    );
    assert(
      source.includes('Deno.env.get("BRAVE_ORIGIN_EXECUTABLE")'),
      `${runner} does not preserve the executable override`,
    );
  }
});
