interface NpmManifest {
  name?: string;
  repository?: {
    type?: string;
    url?: string;
  };
  version?: string;
}

interface JsrManifest {
  name?: string;
  version?: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const npm = JSON.parse(
  await Deno.readTextFile("package.json"),
) as NpmManifest;
const jsr = JSON.parse(
  await Deno.readTextFile("deno.json"),
) as JsrManifest;

assert(
  npm.name === "@bloomler/headlessui-solid",
  "Unexpected NPM package name",
);
assert(
  jsr.name === "@bloomler/headlessui-solid",
  "Unexpected JSR package name",
);
assert(
  npm.version !== undefined && npm.version === jsr.version,
  "NPM and JSR versions must match",
);

const tag = Deno.args[0];
if (tag !== undefined) {
  assert(
    tag === `v${npm.version}`,
    `Tag ${tag} does not match v${npm.version}`,
  );
}

const githubRepository = Deno.env.get("GITHUB_REPOSITORY");
if (githubRepository !== undefined) {
  assert(
    npm.repository?.type === "git" &&
      npm.repository.url ===
        `git+https://github.com/${githubRepository}.git`,
    "NPM repository metadata does not match GITHUB_REPOSITORY",
  );
}

console.log(
  `Release metadata is consistent: ${npm.name} / ${jsr.name} ${npm.version}`,
);
