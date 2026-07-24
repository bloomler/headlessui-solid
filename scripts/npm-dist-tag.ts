interface NpmManifest {
  version?: string;
}

export function npmDistTag(version: string): string {
  const prerelease = version.match(
    /^\d+\.\d+\.\d+-([0-9A-Za-z-]+)(?:[.+]|$)/,
  )?.[1];

  return prerelease === "beta" ? "latest" : prerelease ?? "latest";
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
