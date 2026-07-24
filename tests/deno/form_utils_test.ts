import { objectToFormEntries } from "../../src/utils/form.ts";

function deepStrictEqual(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${actualJson} to deeply equal ${expectedJson}`);
  }
}

const upstreamCases: readonly [
  name: string,
  input: Record<string, unknown> | readonly unknown[],
  output: readonly [string, string][],
][] = [
  ["plain object", { a: "b" }, [["a", "b"]]],
  [
    "array",
    [1, 2, 3],
    [["0", "1"], ["1", "2"], ["2", "3"]],
  ],
  [
    "nested object",
    {
      id: 1,
      admin: true,
      name: {
        first: "Jane",
        last: "Doe",
        nickname: { preferred: "JDoe" },
      },
    },
    [
      ["id", "1"],
      ["admin", "1"],
      ["name[first]", "Jane"],
      ["name[last]", "Doe"],
      ["name[nickname][preferred]", "JDoe"],
    ],
  ],
];

for (const [name, input, output] of upstreamCases) {
  Deno.test(`objectToFormEntries preserves the upstream ${name} encoding`, () => {
    deepStrictEqual(objectToFormEntries(input), output);
  });
}

Deno.test("objectToFormEntries encodes Solid control edge values", () => {
  const instant = new Date("2026-07-23T00:00:00.000Z");
  deepStrictEqual(
    objectToFormEntries({
      enabled: false,
      instant,
      missing: undefined,
      nullable: null,
    }),
    [
      ["enabled", "0"],
      ["instant", instant.toISOString()],
      ["missing", ""],
      ["nullable", ""],
    ],
  );
});
