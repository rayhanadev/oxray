import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { personalRuleNames } from "../src/rule-names.ts";

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
            name: "rayhanadev",
            specifier: join(process.cwd(), "src/plugin.ts"),
          },
        ],
        rules: Object.fromEntries(
          personalRuleNames.map((ruleName) => [`rayhanadev/${ruleName}`, "error"]),
        ),
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
    expect(result.output).not.toContain("rayhanadev(");
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
      expect(result.output).toContain("rayhanadev(no-type-erasure)");
    });
  }
});

describe("no-typeof", () => {
  test("allows TypeScript type queries", async () => {
    const result = await lint("type Value = typeof value;");

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("rayhanadev(");
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
      expect(result.output).toContain("rayhanadev(no-typeof)");
    });
  }
});

describe("Zod 4 rules", () => {
  const zodRuleNames = personalRuleNames.filter(
    (ruleName) => ruleName !== "no-type-erasure" && ruleName !== "no-typeof",
  );

  test("reports the mined high-signal anti-patterns", async () => {
    const result = await lint(`
import { z } from "zod/v4";
type User = { id: string };

z.string().url();
z.number().positive().int();
z.object({ id: z.string() }).strict();
z.string().optional().default("fallback");
z.union([z.literal(1), z.literal(2)]);
type Parsed = z.infer<typeof schema>;
const annotated: z.ZodType<User> = z.object({ id: z.string() });
function parseWith<T>(schema: z.ZodType<T>): T { return schema.parse(value); }
schema.safeParse(JSON.parse(text));
schema.safeParse(JSON.parse("{"));
z.string().url().refine((value) => new URL(value).hostname.length > 0);
z.strictObject({ a: z.string(), b: z.string() }).superRefine((value, ctx) => {
  if (value.a === value.b) {
    ctx.addIssue({ code: "custom", message: "a and b conflict" });
  }
});
const refined = z.strictObject({ id: z.string() }).superRefine(() => {});
z.strictObject({ ...refined.shape, name: z.string() });
z.string().min(1).trim();
defineTool({
  input: z.object({
    pull_number: z.number(),
    metadata: z.record(z.string(), z.unknown()),
  }),
});
`);

    expect(result.exitCode).toBe(1);
    for (const ruleName of zodRuleNames) {
      expect(result.output).toContain(`rayhanadev(${ruleName})`);
    }
  });

  test("accepts canonical forms and catalog exclusions", async () => {
    const result = await lint(`
import { z } from "zod/v4";
type User = { id: string };

z.url().max(2_048);
z.string().trim().email();
z.int().positive();
z.coerce.number().int();
z.strictObject({ id: z.string() });
z.string().default("fallback");
z.literal([1, 2]);
z.union([z.literal(1), z.literal("two")]);
type Parsed = z.output<typeof schema>;
const checked = z.object({ id: z.string() }) satisfies z.ZodType<User>;
function parseWith<S extends z.ZodType>(schema: S): z.output<S> { return schema.parse(value); }
try { schema.safeParse(JSON.parse(text)); } catch {}
z.string().refine((value) => {
  try { return new URL(value).hostname.length > 0; } catch { return false; }
});
try {
  z.string().refine((value) => {
    try { return JSON.parse(value) !== null; } catch { return false; }
  });
} catch {}
z.strictObject({ a: z.string(), b: z.string() }).superRefine((value, ctx) => {
  ctx.addIssue({ code: "custom", path: ["a"], message: "a and b conflict" });
});
z.string().superRefine((value, ctx) => {
  ctx.addIssue({ code: "custom", message: "string-level issue" });
});
const plain = z.strictObject({ id: z.string() });
z.strictObject({ ...plain.shape, name: z.string() });
const stillRefined = z.strictObject({ id: z.string() }).superRefine(() => {});
stillRefined.extend({ name: z.string() });
z.string().trim().min(1);
z.record(z.string(), z.string());
const providerResponse = z.object({
  count: z.number(),
  providerMetadata: z.record(z.string(), z.unknown()),
});
defineTool({
  input: z.strictObject({
    pull_number: z.int(),
    price: z.number(),
    nested: z.object({ price: z.number() }),
  }),
});
function schemaFor<T>(): z.ZodType<T> { return value; }
`);

    expect(result.exitCode).toBe(0);
    for (const ruleName of zodRuleNames) {
      expect(result.output).not.toContain(`rayhanadev(${ruleName})`);
    }
  });

  test("requires try/catch inside the refinement callback", async () => {
    const result = await lint(`
import { z } from "zod/v4";
try {
  z.string().refine((value) => new URL(value).hostname.length > 0);
} catch {}
z.string()
  .min(1, { abort: true })
  .superRefine((value, ctx) => {
    if (value === "blocked") {
      ctx.addIssue({ code: "custom", message: "blocked", fatal: true });
    }
  })
  .refine((value) => new URL(value).hostname.length > 0);
`);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(throwing-zod-refine)");
  });

  test("recognizes earlier aborting refinement guards", async () => {
    const result = await lint(`
import { z } from "zod/v4";

z.url({ abort: true }).refine((value) => new URL(value).hostname.length > 0);
z.url()
  .superRefine((value, ctx) => {
    if (!URL.canParse(value)) {
      ctx.addIssue({ code: "custom", message: "invalid URL", fatal: true });
      return z.NEVER;
    }
  })
  .refine((value) => new URL(value).hostname.length > 0);
`);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("rayhanadev(throwing-zod-refine)");
  });

  test("ignores explicit Zod 3 and unrelated z bindings", async () => {
    const result = await lint(`
import { z as z3 } from "zod/v3";

z3.string().url();
z3.number().int();
z3.union([z3.literal(1), z3.literal(2)]);

const z = makeUnrelatedBuilder();
z.string().url();
z.number().int();
`);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("rayhanadev(");
  });

  test("keeps intentional broad and order-sensitive schemas", async () => {
    const result = await lint(`
import { z } from "zod/v4";

type Node = { children: Node[] };
const nodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.object({ children: z.array(nodeSchema) }),
);
const getterSchema: z.ZodType<Node> = z.object({
  get children() {
    return z.array(getterSchema);
  },
});
export const publicSchema: z.ZodType<Node> = z.object({ children: z.array(z.unknown()) });

function codec<Output, Input>(schema: z.ZodType<Output, Input>) {
  return schema;
}
function factory<Output>(options: { schema: z.ZodType<Output> }) {
  return options.schema;
}

const providerMetadata = z.record(z.string(), z.unknown());
schema.safeParse(JSON.parse('{"__proto__":123}'));
z.string().min(2).trim();
z.strictObject({ a: z.string(), b: z.string(), c: z.string() }).superRefine((value, ctx) => {
  if (value.a === "" && value.b === "" && value.c === "") {
    ctx.addIssue({ code: "custom", message: "at least one value is required" });
  }
});
`);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("rayhanadev(");
  });

  test("preserves CUID and versioned UUID formats in suggestions", async () => {
    const result = await lint(`
import { z as schema } from "zod/v4";
schema.string().cuid();
schema.string().uuidv4();
schema.string().uuidv6();
schema.string().uuidv7();
`);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("schema.cuid()");
    expect(result.output).toContain("schema.uuidv4()");
    expect(result.output).toContain("schema.uuidv6()");
    expect(result.output).toContain("schema.uuidv7()");
    expect(result.output).not.toContain("schema.cuid2()");
  });
});
