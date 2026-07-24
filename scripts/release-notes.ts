interface ReleaseManifest {
  version?: string;
}

/**
 * Return the complete changelog section for one release.
 */
export function extractReleaseNotes(
  changelog: string,
  version: string,
): string {
  const lines = changelog.replaceAll("\r\n", "\n").split("\n");
  const heading = `## [${version}]`;
  const start = lines.findIndex((line) =>
    line === heading || line.startsWith(`${heading} - `)
  );

  if (start === -1) {
    throw new Error(`CHANGELOG.md does not contain a ${heading} section`);
  }

  const next = lines.findIndex((line, index) =>
    index > start && line.startsWith("## [")
  );
  const end = next === -1 ? lines.length : next;

  return `${lines.slice(start, end).join("\n").trimEnd()}\n`;
}

if (import.meta.main) {
  const manifest = JSON.parse(
    await Deno.readTextFile("deno.json"),
  ) as ReleaseManifest;
  const version = Deno.args[0] ?? manifest.version;

  if (version === undefined) {
    throw new Error("deno.json does not define a version");
  }

  const changelog = await Deno.readTextFile("CHANGELOG.md");
  await Deno.stdout.write(
    new TextEncoder().encode(extractReleaseNotes(changelog, version)),
  );
}
