interface NpmManifest {
  version?: string;
}

export type NpmDistTags = readonly [string, ...string[]];

export function npmDistTags(version: string): NpmDistTags {
  const prerelease = version.match(
    /^\d+\.\d+\.\d+-([0-9A-Za-z-]+)(?:[.+]|$)/,
  )?.[1];

  return prerelease === "beta" ? ["latest", "beta"] : [prerelease ?? "latest"];
}

export function npmDistTag(version: string): string {
  return npmDistTags(version)[0];
}

if (import.meta.main) {
  const manifest = JSON.parse(
    await Deno.readTextFile("package.json"),
  ) as NpmManifest;

  if (manifest.version === undefined) {
    throw new Error("package.json does not define a version");
  }

  console.log(npmDistTag(manifest.version));
}
