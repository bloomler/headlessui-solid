import { npmDistTags } from "./npm-dist-tag.ts";

interface NpmManifest {
  name?: string;
  version?: string;
}

interface NpmRegistryDocument {
  "dist-tags"?: Record<string, string>;
}

const npmCli = "npm:npm@11.5.2";
const npmRegistry = "https://registry.npmjs.org/";

export function pendingNpmDistTags(
  actual: Record<string, string>,
  version: string,
): string[] {
  return npmDistTags(version).filter((tag) => actual[tag] !== version);
}

async function readNpmDistTags(
  name: string,
): Promise<Record<string, string>> {
  const url = new URL(encodeURIComponent(name), npmRegistry);
  url.searchParams.set("cacheBust", Date.now().toString());

  const response = await fetch(url, {
    headers: { "cache-control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error(
      `Could not read NPM metadata for ${name}: ${response.status} ${response.statusText}`,
    );
  }

  const document = await response.json() as NpmRegistryDocument;
  if (document["dist-tags"] === undefined) {
    throw new Error(`NPM metadata for ${name} does not contain dist-tags`);
  }

  return document["dist-tags"];
}

function describePendingTags(
  pending: string[],
  actual: Record<string, string>,
  version: string,
): string {
  return pending
    .map((tag) => `${tag}=${actual[tag] ?? "<missing>"} (expected ${version})`)
    .join(", ");
}

async function syncNpmDistTags(
  name: string,
  version: string,
): Promise<void> {
  const actual = await readNpmDistTags(name);
  const pending = pendingNpmDistTags(actual, version);

  if (pending.length === 0) {
    console.log(`NPM distribution tags already match ${name}@${version}.`);
    return;
  }

  for (const tag of pending) {
    console.log(`Setting ${name}@${version} as the NPM ${tag} tag...`);
    const child = new Deno.Command("deno", {
      args: [
        "run",
        "--no-config",
        "-A",
        npmCli,
        "dist-tag",
        "add",
        `${name}@${version}`,
        tag,
        "--auth-type=web",
        `--registry=${npmRegistry}`,
      ],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }).spawn();
    const status = await child.status;
    if (!status.success) {
      throw new Error(`Could not set the NPM ${tag} tag`);
    }
  }

  const verified = await readNpmDistTags(name);
  const stillPending = pendingNpmDistTags(verified, version);
  if (stillPending.length > 0) {
    throw new Error(
      `NPM distribution tag verification failed: ${
        describePendingTags(stillPending, verified, version)
      }`,
    );
  }

  console.log(`NPM distribution tags now match ${name}@${version}.`);
}

async function checkNpmDistTags(
  name: string,
  version: string,
): Promise<void> {
  const actual = await readNpmDistTags(name);
  const pending = pendingNpmDistTags(actual, version);

  if (pending.length > 0) {
    throw new Error(
      `NPM distribution tags are incomplete: ${
        describePendingTags(pending, actual, version)
      }. Run "deno task release:npm-tags" from the release checkout with your passkey, then rerun this workflow.`,
    );
  }

  console.log(`NPM distribution tags match ${name}@${version}.`);
}

if (import.meta.main) {
  if (Deno.args.some((argument) => argument !== "--check")) {
    throw new Error("Usage: sync-npm-dist-tags.ts [--check]");
  }

  const manifest = JSON.parse(
    await Deno.readTextFile("package.json"),
  ) as NpmManifest;
  if (manifest.name === undefined || manifest.version === undefined) {
    throw new Error("package.json must define name and version");
  }

  if (Deno.args.includes("--check")) {
    await checkNpmDistTags(manifest.name, manifest.version);
  } else {
    await syncNpmDistTags(manifest.name, manifest.version);
  }
}
