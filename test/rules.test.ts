import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let fixtureDirectory: string;
let fixtureNumber = 0;

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), "oxray-rule-test-"));
  await Bun.write(
    join(fixtureDirectory, ".oxlintrc.json"),
    JSON.stringify(
      {
        jsPlugins: [
          {
            name: "oxray",
            specifier: join(process.cwd(), "src/plugin.ts"),
          },
        ],
        rules: {
          "oxray/no-type-erasure": "error",
          "oxray/no-typeof": "error",
        },
      },
      null,
      2,
    ),
  );
});

afterAll(async () => {
  await rm(fixtureDirectory, { recursive: true });
});

async function lint(code: string): Promise<{ exitCode: number; output: string }> {
  fixtureNumber += 1;
  const fixturePath = join(fixtureDirectory, `fixture-${fixtureNumber}.ts`);
  await Bun.write(fixturePath, code);
  const child = Bun.spawn(
    [
      join(process.cwd(), "node_modules/.bin/oxlint"),
      "--config",
      join(fixtureDirectory, ".oxlintrc.json"),
      fixturePath,
    ],
    { stderr: "pipe", stdout: "pipe" },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, output: stdout + stderr };
}

describe("no-type-erasure", () => {
  test("accepts concrete object shapes and domain-specific guards", async () => {
    const result = await lint(`
type UserMap = Record<string, User>;
type RoleMap = Record<"admin" | "member", User>;
interface User { id: string }
type MaybeUser = unknown;
function isUser(value: unknown): value is User { return Boolean(value); }
isUser(value);
`);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("oxray(");
  });

  const invalidCases = [
    ["type Data = Record<string, unknown>;", "broad string keys"],
    ["type Data = Record<string, any>;", "broad string keys"],
    ["type Data = { [key: string]: unknown };", "broad string keys"],
    ["interface Data { [key: string]: any }", "broad string keys"],
    ["type Data = object;", "broad object type"],
    ["type Data = Object;", "Object type"],
    ["type Data = {};", "empty object type"],
    ["interface Data {}", "empty interface"],
    ["isRecord(value);", "direct isRecord call"],
    ["guards.isRecord(value);", "member isRecord call"],
    ['guards["isRecord"](value);', "computed isRecord call"],
    ["guards.isRecord?.(value);", "optional isRecord call"],
  ] as const;

  for (const [code, name] of invalidCases) {
    test(`reports ${name}`, async () => {
      const result = await lint(code);

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("oxray(no-type-erasure)");
    });
  }
});

describe("no-typeof", () => {
  test("allows TypeScript type queries", async () => {
    const result = await lint("type Value = typeof value;");

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("oxray(");
  });

  const invalidCases = [
    "const kind = typeof value;",
    'if (typeof value === "string") consume(value);',
    'if ("object" === typeof value) consume(value);',
  ];

  for (const code of invalidCases) {
    test(`reports ${code}`, async () => {
      const result = await lint(code);

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("oxray(no-typeof)");
    });
  }
});
