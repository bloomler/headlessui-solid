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

console.log(
  `JSR documentation score inputs are complete: ${entrypoint.symbols.length} public symbols documented`,
);
