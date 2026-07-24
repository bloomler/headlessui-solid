interface JsrManifest {
  name?: string;
  version?: string;
}

export interface PublishedJsrMetadata {
  latestVersion?: string | null;
  score?: number | null;
}

/**
 * Return whether JSR exposes the expected stable version with a perfect score.
 */
export function hasPerfectPublishedJsrScore(
  metadata: PublishedJsrMetadata,
  version: string,
): boolean {
  return metadata.latestVersion === version && metadata.score === 100;
}

if (import.meta.main) {
  const manifest = JSON.parse(
    await Deno.readTextFile("deno.json"),
  ) as JsrManifest;
  const packageName = manifest.name?.match(/^@([^/]+)\/([^/]+)$/);

  if (
    packageName === undefined || packageName === null ||
    manifest.version === undefined
  ) {
    throw new Error("deno.json does not define a valid JSR name and version");
  }

  const [, scope, name] = packageName;
  const packageUrl = `https://api.jsr.io/scopes/${
    encodeURIComponent(scope)
  }/packages/${encodeURIComponent(name)}`;
  const headers = {
    accept: "application/json",
    "user-agent":
      "headlessui-solid-release-check; https://github.com/bloomler/headlessui-solid",
  };
  let lastMetadata: PublishedJsrMetadata | undefined;

  for (let attempt = 1; attempt <= 60; attempt++) {
    const response = await fetch(packageUrl, { headers });

    if (response.ok) {
      lastMetadata = await response.json() as PublishedJsrMetadata;
      if (hasPerfectPublishedJsrScore(lastMetadata, manifest.version)) {
        console.log(
          `JSR reports ${manifest.name}@${manifest.version} with a 100% score.`,
        );
        Deno.exit();
      }
    }

    if (attempt === 1 || attempt % 6 === 0) {
      console.log(
        `Waiting for JSR score processing (${attempt}/60): latest=${
          lastMetadata?.latestVersion ?? "<pending>"
        }, score=${lastMetadata?.score ?? "<pending>"}`,
      );
    }

    if (attempt < 60) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }

  const scoreResponse = await fetch(`${packageUrl}/score`, { headers });
  const scoreDetails = scoreResponse.ok
    ? await scoreResponse.text()
    : `${scoreResponse.status} ${scoreResponse.statusText}`;

  throw new Error(
    `JSR did not report ${manifest.name}@${manifest.version} with a 100% score. Last package metadata: ${
      JSON.stringify(lastMetadata)
    }. Score details: ${scoreDetails}`,
  );
}
