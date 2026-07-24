import { npmDistTag, npmDistTags } from "../../scripts/npm-dist-tag.ts";
import { jsrVersionPublished } from "../../scripts/jsr-version-published.ts";
import { hasPerfectPublishedJsrScore } from "../../scripts/check-published-jsr-score.ts";
import { extractReleaseNotes } from "../../scripts/release-notes.ts";
import { pendingNpmDistTags } from "../../scripts/sync-npm-dist-tags.ts";

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
  const npmTagIndex = publish.indexOf(
    "NPM_TAG=$(deno run --allow-read scripts/npm-dist-tag.ts)",
  );
  const npmTagGuardIndex = publish.indexOf('test -n "${NPM_TAG}"');
  const npmTagExportIndex = publish.indexOf(
    'echo "NPM_TAG=${NPM_TAG}" >> "$GITHUB_ENV"',
  );
  const npmDryRunIndex = publish.indexOf("npm publish --dry-run");
  const jsrDryRunIndex = publish.indexOf("deno publish --dry-run");
  const npmPublishIndex = publish.indexOf("npm publish --tag");
  const jsrPublishIndex = publish.lastIndexOf("deno publish --allow-dirty");
  const jsrScoreCheckIndex = publish.indexOf(
    "deno task release:jsr-score:check",
  );
  const npmTagsCheckIndex = publish.indexOf(
    "deno task release:npm-tags:check",
  );
  const githubReleaseIndex = publish.indexOf("gh release create");
  assert(
    verifyIndex >= 0 &&
      npmTagIndex > verifyIndex &&
      npmTagGuardIndex > npmTagIndex &&
      npmTagExportIndex > npmTagGuardIndex &&
      npmDryRunIndex > npmTagExportIndex &&
      jsrDryRunIndex > verifyIndex &&
      npmPublishIndex > npmDryRunIndex &&
      npmPublishIndex > jsrDryRunIndex &&
      jsrPublishIndex > npmPublishIndex &&
      jsrScoreCheckIndex > jsrPublishIndex &&
      npmTagsCheckIndex > jsrScoreCheckIndex &&
      githubReleaseIndex > npmTagsCheckIndex,
    "Publish workflow does not verify and dry-run both registries before publishing",
  );
  assert(
    publish.includes("contents: write") &&
      publish.includes("id-token: write") &&
      !publish.includes("NODE_AUTH_TOKEN"),
    "Publish workflow lacks tokenless OIDC or GitHub release permissions",
  );
  assert(
    publish.includes("id: npm_release") &&
      publish.includes(
        "if: steps.npm_release.outputs.published != 'true'",
      ) &&
      publish.includes("id: jsr_release") &&
      publish.includes(
        "if: steps.jsr_release.outputs.published != 'true'",
      ) &&
      publish.includes("gh release view") &&
      publish.includes("--verify-tag") &&
      publish.includes(
        "deno run --allow-read scripts/release-notes.ts > release-notes.md",
      ) &&
      publish.includes("--notes-file release-notes.md") &&
      !publish.includes("--generate-notes") &&
      !publish.includes("--prerelease"),
    "Publish workflow cannot safely resume or create a GitHub release",
  );
});

Deno.test("published JSR releases require the exact stable version at 100%", () => {
  assert(
    hasPerfectPublishedJsrScore(
      { latestVersion: "0.1.0", score: 100 },
      "0.1.0",
    ),
    "A perfect matching JSR release was rejected",
  );
  assert(
    !hasPerfectPublishedJsrScore(
      { latestVersion: "0.1.0", score: 99 },
      "0.1.0",
    ),
    "An imperfect JSR score was accepted",
  );
  assert(
    !hasPerfectPublishedJsrScore(
      { latestVersion: "0.1.1", score: 100 },
      "0.1.0",
    ),
    "A different JSR version was accepted",
  );
});

Deno.test("GitHub release notes match the exact versioned changelog section", () => {
  const changelog = `# Changelog

## [Unreleased]

## [0.1.0] - 2026-07-25

### Fixed

- Preserve these notes.

## [0.1.0-beta.4] - 2026-07-24

- Older notes.
`;

  assert(
    extractReleaseNotes(changelog, "0.1.0") ===
      `## [0.1.0] - 2026-07-25

### Fixed

- Preserve these notes.
`,
    "GitHub release notes do not exactly match the requested changelog section",
  );
});

Deno.test("release versions map to explicit NPM distribution tags", () => {
  assert(npmDistTag("1.2.3") === "latest", "Stable releases must use latest");
  assert(
    npmDistTag("0.1.0-beta.4") === "latest",
    "Beta releases must update latest",
  );
  assert(
    JSON.stringify(npmDistTags("0.1.0-beta.4")) ===
      JSON.stringify(["latest", "beta"]),
    "Beta releases must update both latest and beta",
  );
  assert(
    JSON.stringify(
      pendingNpmDistTags(
        { latest: "0.1.0-beta.4", beta: "0.1.0-beta.3" },
        "0.1.0-beta.4",
      ),
    ) === JSON.stringify(["beta"]),
    "A stale beta tag must block release completion",
  );
  assert(
    npmDistTag("2.0.0-rc.1+build.7") === "rc",
    "Release candidates must use rc",
  );
});

Deno.test("release guide includes the passkey-backed NPM tag finalizer", async () => {
  const guide = await Deno.readTextFile("RELEASING.md");
  const manifest = JSON.parse(
    await Deno.readTextFile("deno.json"),
  ) as DenoManifest;

  assert(
    guide.includes("deno task release:npm-tags") &&
      guide.includes("passkey prompt") &&
      guide.includes("both `latest` and `beta`"),
    "Release guide omits the passkey-backed NPM tag finalizer",
  );
  assert(
    manifest.tasks["release:npm-tags"]?.includes(
      "scripts/sync-npm-dist-tags.ts",
    ) &&
      manifest.tasks["release:npm-tags:check"]?.includes("--check") &&
      manifest.tasks["release:jsr-score:check"]?.includes(
        "scripts/check-published-jsr-score.ts",
      ),
    "Deno tasks do not expose NPM tag synchronization and verification",
  );
});

Deno.test("JSR release metadata detects immutable published versions", () => {
  const metadata = {
    versions: {
      "0.1.0-beta.4": {
        createdAt: "2026-07-24T03:15:33.513191Z",
      },
    },
  };

  assert(
    jsrVersionPublished(metadata, "0.1.0-beta.4"),
    "Published JSR version was not detected",
  );
  assert(
    !jsrVersionPublished(metadata, "0.1.0-beta.5"),
    "Unpublished JSR version was reported as published",
  );
  assert(
    !jsrVersionPublished({}, "0.1.0-beta.4"),
    "Missing JSR metadata was reported as published",
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
    npm.version === "0.1.0" && npm.version === deno.version,
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
  assert(
    entry?.types === "./dist/index.d.ts",
    "NPM types do not target the declaration build",
  );
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
  assert(
    npm.files?.includes("dist") && npm.files.includes("src"),
    "NPM must publish both built artifacts and their source",
  );

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
