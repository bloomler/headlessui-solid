interface DocDeclaration {
  jsDoc?: {
    doc?: string;
  };
}

interface DocSymbol {
  declarations: DocDeclaration[];
  name: string;
}

interface DocNode {
  module_doc?: {
    doc?: string;
  };
  symbols: DocSymbol[];
}

interface DocOutput {
  nodes: Record<string, DocNode>;
}

interface JsrManifest {
  name?: string;
}

interface JsrPackageMetadata {
  description?: string | null;
  githubRepository?: {
    name?: string;
    owner?: string;
  } | null;
  runtimeCompat?: Record<string, boolean | null>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const readme = await Deno.readTextFile("README.md");
assert(readme.trim().length > 0, "JSR score requires a non-empty README.md");
assert(
  /```(?:[^\r\n]*)?[\r\n]/.test(readme),
  "JSR score requires a code example in README.md",
);

const output = JSON.parse(
  await new Response(Deno.stdin.readable).text(),
) as DocOutput;
const entrypoint = Object.values(output.nodes)[0];
assert(entrypoint !== undefined, "deno doc returned no entrypoint");
assert(
  entrypoint.module_doc?.doc?.trim(),
  "JSR score requires module documentation for the public entrypoint",
);

const undocumented = entrypoint.symbols.filter((symbol) =>
  !symbol.declarations.some((declaration) =>
    Boolean(declaration.jsDoc?.doc?.trim())
  )
);
assert(
  undocumented.length === 0,
  `Public symbols without documentation: ${
    undocumented.map((symbol) => symbol.name).join(", ")
  }`,
);

const manifest = JSON.parse(
  await Deno.readTextFile("deno.json"),
) as JsrManifest;
const packageName = manifest.name?.match(/^@([^/]+)\/([^/]+)$/);
assert(packageName !== undefined && packageName !== null, "Invalid JSR name");

const [, scope, name] = packageName;
const response = await fetch(
  `https://api.jsr.io/scopes/${encodeURIComponent(scope)}/packages/${
    encodeURIComponent(name)
  }`,
  {
    headers: {
      accept: "application/json",
      "user-agent":
        "headlessui-solid-release-check; https://github.com/bloomler/headlessui-solid",
    },
  },
);
assert(
  response.ok,
  `Could not read JSR package settings: ${response.status} ${response.statusText}`,
);

const metadata = await response.json() as JsrPackageMetadata;
assert(metadata.description?.trim(), "JSR package description is missing");

const compatibleRuntimes = Object.entries(metadata.runtimeCompat ?? {})
  .filter(([, compatible]) => compatible)
  .map(([runtime]) => runtime);
assert(
  compatibleRuntimes.length > 1,
  "JSR must mark multiple runtimes as compatible",
);
assert(
  metadata.githubRepository?.owner === "bloomler" &&
    metadata.githubRepository.name === "headlessui-solid",
  "JSR is not linked to the release repository",
);

const publishWorkflow = await Deno.readTextFile(
  ".github/workflows/publish.yml",
);
assert(
  publishWorkflow.includes("id-token: write") &&
    publishWorkflow.includes("deno publish --allow-dirty"),
  "JSR publication is not configured for OIDC provenance",
);

console.log(
  `JSR 100% score prerequisites are complete: ${entrypoint.symbols.length} public symbols documented, ${compatibleRuntimes.length} runtimes compatible, description and OIDC provenance configured`,
);
