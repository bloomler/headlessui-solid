interface JsrManifest {
  name?: string;
  version?: string;
}

interface JsrPackageMetadata {
  versions?: Record<string, unknown>;
}

export function jsrVersionPublished(
  metadata: JsrPackageMetadata,
  version: string,
): boolean {
  return Object.hasOwn(metadata.versions ?? {}, version);
}

if (import.meta.main) {
  const manifest = JSON.parse(
    await Deno.readTextFile("deno.json"),
  ) as JsrManifest;

  if (manifest.name === undefined || manifest.version === undefined) {
    throw new Error("deno.json does not define a package name and version");
  }

  const response = await fetch(
    `https://jsr.io/${manifest.name}/meta.json`,
    { headers: { accept: "application/json" } },
  );

  if (response.status === 404) {
    console.log("false");
    Deno.exit();
  }

  if (!response.ok) {
    throw new Error(
      `Could not check JSR release status: ${response.status} ${response.statusText}`,
    );
  }

  const metadata = await response.json() as JsrPackageMetadata;
  console.log(jsrVersionPublished(metadata, manifest.version));
}
