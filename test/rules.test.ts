import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { personalRuleDefaults, personalRuleNames } from "../src/rule-names.ts";

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
          personalRuleNames.map((ruleName) => [
            `rayhanadev/${ruleName}`,
            personalRuleDefaults[ruleName],
          ]),
        ),
      },
      null,
      2,
    ),
  );
  await Bun.write(
    join(fixtureDirectory, "AGENTS.md"),
    "# Fixture guidance\n\n## Retry policy\n\nRetry only transient failures.\n",
  );
});

afterAll(async () => {
  await rm(fixtureDirectory, { recursive: true });
});

async function lint(
  code: string,
  flags: readonly string[] = [],
): Promise<{ code: string; exitCode: number; output: string }> {
  fixtureNumber += 1;
  const fixturePath = join(fixtureDirectory, `fixture-${fixtureNumber}.ts`);
  await Bun.write(fixturePath, code);
  const child = Bun.spawn(
    [
      join(process.cwd(), "node_modules/.bin/oxlint"),
      "--config",
      join(fixtureDirectory, ".oxlintrc.json"),
      ...flags,
      fixturePath,
    ],
    { stderr: "pipe", stdout: "pipe" },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return {
    code: await Bun.file(fixturePath).text(),
    exitCode,
    output: stdout + stderr,
  };
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
  const nonZodRuleNames = new Set([
    "comment-explains-why",
    "comment-ste100",
    "comment-ste100-heuristics",
    "commented-out-code-requires-reason",
    "complex-file-header",
    "domain-knowledge-in-agents",
    "lint-suppression-requires-reason",
    "no-type-erasure",
    "no-typeof",
    "require-jsdoc-comments",
  ]);
  const zodRuleNames = personalRuleNames.filter((ruleName) => !nonZodRuleNames.has(ruleName));

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

  test("applies exact behavior-preserving corrections with --fix", async () => {
    const result = await lint(
      `
import { z as schema } from "zod/v4";
type User = { id: string };

schema.number().positive().int();
schema.object({ id: schema.string() }).strict();
schema.string().optional().default("fallback");
schema.union([schema.literal(1), schema.literal(2)]);
type Parsed = schema.infer<typeof userSchema>;
schema.string().uuidv4();
const userSchema: schema.ZodType<User> = schema.object({ id: schema.string() });
`,
      ["--fix"],
    );

    expect(result.exitCode).toBe(0);
    expect(result.code).toContain("schema.int().positive()");
    expect(result.code).toContain("schema.strictObject({ id: schema.string() })");
    expect(result.code).toContain('schema.string().default("fallback")');
    expect(result.code).toContain("schema.literal([1, 2])");
    expect(result.code).toContain("schema.output<typeof userSchema>");
    expect(result.code).toContain("schema.uuidv4()");
    expect(result.code).toContain(
      "const userSchema = schema.object({ id: schema.string() }) satisfies schema.ZodType<User>",
    );
  });

  test("reserves behavior-changing corrections for --fix-suggestions", async () => {
    const source = `
import { z } from "zod/v4";
defineTool({
  input: z.object({
    pull_number: z.number(),
    name: z.string().min(1).trim(),
  }),
});
z.strictObject({ name: z.string() }).superRefine((value, ctx) => {
  if (value.name === "") {
    ctx.addIssue({ code: "custom", message: "name is required" });
  }
});
z.string().refine((value) => new URL(value).hostname.length > 0);
`;
    const safeResult = await lint(source, ["--fix"]);

    expect(safeResult.exitCode).toBe(1);
    expect(safeResult.code).toBe(source);

    const suggestedResult = await lint(source, ["--fix-suggestions"]);

    expect(suggestedResult.exitCode).toBe(0);
    expect(suggestedResult.code).toContain("input: z.strictObject({");
    expect(suggestedResult.code).toContain("pull_number: z.int()");
    expect(suggestedResult.code).toContain("name: z.string().trim().min(1)");
    expect(suggestedResult.code).toContain(
      'ctx.addIssue({ path: ["name"], code: "custom", message: "name is required" })',
    );
    expect(suggestedResult.code).toContain(
      "(value) => { try { return new URL(value).hostname.length > 0; } catch { return false; } }",
    );
  });
});

describe("comment rules", () => {
  test("requires useful JSDoc on public functions and classes", async () => {
    const result = await lint(`
export function connectClient() {}
// Preserves a stable identity because callers cache each client.
class ClientFactory {}
`);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(require-jsdoc-comments)");
  });

  test("accepts public JSDoc that explains a contract", async () => {
    const result = await lint(`
/** Uses one client instance so callers can share connection state. */
export function connectClient() {}

/** Preserves a stable identity because callers cache each client. */
export class ClientFactory {}
`);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("rayhanadev(require-jsdoc-comments)");
  });

  test("resolves indirect, default, and variable exports", async () => {
    const result = await lint(`
/** Shares one connection because callers reuse provider state. */
const connect = () => {};
export { connect };

/** Preserves the provider contract when this module is the default import. */
function ProviderClient() {}
export default ProviderClient;

/** Defers setup until the command selects a runtime. */
export const initialize = async () => {};

function internalHelper() {}
`);

    expect(result.output).not.toContain("rayhanadev(require-jsdoc-comments)");
  });

  test("shares JSDoc across overloads and unwraps typed function exports", async () => {
    const result = await lint(`
/** Preserves the input family so callers receive the corresponding output type. */
export function convert(value: string): string;
export function convert(value: number): number;
export function convert(value: string | number): string | number { return value; }

/** Uses the declared callable contract without hiding the exported function. */
export const load = (() => value) satisfies () => string;
`);

    expect(result.output).not.toContain("rayhanadev(require-jsdoc-comments)");
  });

  test("does not use a trailing comment as public API documentation", async () => {
    const result = await lint(`
const prior = value; /** Describes only the prior value. */
export function load() {}
`);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(require-jsdoc-comments)");
  });

  test("requires JSDoc when a plain comment describes a method", async () => {
    const result = await lint(`
class Client {
  // Preserves the request identifier when the provider retries.
  retry() {}
}
`);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(require-jsdoc-comments)");
  });

  test("does not attach variable comments or directives to nested callbacks", async () => {
    const result = await lint(`
// The output keeps only active users.
const output = users.filter((user) => user.active);

// @ts-ignore
function generatedCompatibilityShim() {}

////////////////////////////////////////
function groupedHelper() {}

const first = () => {}; // This result is fast.
const second = () => {};
`);

    expect(result.output).not.toContain("rayhanadev(require-jsdoc-comments)");
  });

  test("enforces deterministic STE prose limits", async () => {
    const result = await lint(`
// The client can't retry this operation; preserve the original response.
const response = value;
`);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(comment-ste100)");
  });

  test("enforces exact descriptive and procedural sentence boundaries", async () => {
    const descriptive25 = `// ${Array.from({ length: 25 }, (_, index) => `word${index}`).join(" ")}.`;
    const descriptive26 = `// ${Array.from({ length: 26 }, (_, index) => `word${index}`).join(" ")}.`;
    const procedural20 = `// Use ${Array.from({ length: 19 }, (_, index) => `item${index}`).join(" ")}.`;
    const procedural21 = `// Use ${Array.from({ length: 20 }, (_, index) => `item${index}`).join(" ")}.`;

    const valid = await lint(`${descriptive25}\n${procedural20}\n`);
    const tooLong = await lint(`${descriptive26}\n${procedural21}\n`);

    expect(valid.output).not.toContain("rayhanadev(comment-ste100)");
    expect(valid.output).not.toContain("rayhanadev(comment-ste100-heuristics)");
    expect(tooLong.exitCode).toBe(1);
    expect(tooLong.output).toContain("rayhanadev(comment-ste100)");
    expect(tooLong.output).toContain("rayhanadev(comment-ste100-heuristics)");
  });

  test("checks a parenthetical sentence independently", async () => {
    const inner = Array.from({ length: 26 }, (_, index) => `word${index}`).join(" ");
    const result = await lint(`// Keep the value (${inner}).\n`);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(comment-ste100)");
  });

  test("warns about passive voice without failing lint", async () => {
    const result = await lint(`
// The response is processed by the worker.
const response = value;
`);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("rayhanadev(comment-ste100-heuristics)");
  });

  test("warns only on a high-confidence dense noun cluster", async () => {
    const dense = await lint(
      "// Configuration implementation instrumentation authorization fails safely.\n",
    );
    const technical = await lint(
      "// Read-only projection over organization-member fields stays narrow.\n",
    );

    expect(dense.output).toContain("rayhanadev(comment-ste100-heuristics)");
    expect(technical.output).not.toContain("rayhanadev(comment-ste100-heuristics)");
  });

  test("does not mistake adjectives and pronouns for progressive tense", async () => {
    const result = await lint(`
// The value is missing, and there is nothing to recover.
// This string is confusing without its label.
const result = value;
`);

    expect(result.output).not.toContain("rayhanadev(comment-ste100-heuristics)");
  });

  test("does not mistake the adjective red for passive voice", async () => {
    const result = await lint("// CI is red when the generated table changes.\n");

    expect(result.output).not.toContain("rayhanadev(comment-ste100-heuristics)");
  });

  test("warns when JSDoc only restates a declaration name", async () => {
    const result = await lint(`
/** Returns the user. */
function getUser() {}
`);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("rayhanadev(comment-explains-why)");
  });

  test("moves marked domain facts and validates AGENTS references", async () => {
    const invalid = await lint(`
// INVARIANT: A retry always preserves the request identifier.
const requestId = value;
/** @see AGENTS.md#missing-policy */
const retry = value;
`);
    const valid = await lint(`
/** @see AGENTS.md#retry-policy */
const retry = value;
`);

    expect(invalid.exitCode).toBe(1);
    expect(invalid.output).toContain("rayhanadev(domain-knowledge-in-agents)");
    expect(valid.exitCode).toBe(0);
    expect(valid.output).not.toContain("rayhanadev(domain-knowledge-in-agents)");
  });

  test("ignores domain markers inside JSDoc examples", async () => {
    const result = await lint(`
/**
 * Shows how callers document a shared constraint.
 * @example
 * // INVARIANT: The request identifier remains stable.
 */
const example = value;
`);

    expect(result.output).not.toContain("rayhanadev(domain-knowledge-in-agents)");
  });

  test("requires narrow lint suppressions with explanations", async () => {
    const invalid = await lint(`
// oxlint-disable-next-line no-console
console.log(value);
`);
    const broad = await lint(`
/* oxlint-disable no-console -- The executable must print its final result. */
console.log(value);
`);
    const valid = await lint(`
// oxlint-disable-next-line no-console -- The executable must print its final result.
console.log(value);
`);

    expect(invalid.exitCode).toBe(1);
    expect(broad.exitCode).toBe(1);
    expect(invalid.output).toContain("rayhanadev(lint-suppression-requires-reason)");
    expect(broad.output).toContain("rayhanadev(lint-suppression-requires-reason)");
    expect(valid.output).not.toContain("rayhanadev(lint-suppression-requires-reason)");
  });

  test("requires a rationale for commented-out implementation code", async () => {
    const invalid = await lint("// const oldValue = loadValue();\n");
    const kept = await lint(`
// KEPT: This statement documents the legacy migration fallback.
// const oldValue = loadValue();
`);
    const example = await lint(`
/**
 * @example
 * const oldValue = loadValue();
 */
const exampleValue = value;
`);

    expect(invalid.exitCode).toBe(1);
    expect(invalid.output).toContain("rayhanadev(commented-out-code-requires-reason)");
    expect(kept.output).not.toContain("rayhanadev(commented-out-code-requires-reason)");
    expect(example.output).not.toContain("rayhanadev(commented-out-code-requires-reason)");
  });

  test("does not mistake imperative prose for commented-out code", async () => {
    const result = await lint(`
// Return the original value when validation fails.
// app.get(handler)
// SHA256 (32 bytes): base64 output has 44 characters.
const result = value;
`);

    expect(result.output).not.toContain("rayhanadev(commented-out-code-requires-reason)");
  });

  test("warns when a structurally complex module has no file overview", async () => {
    const declarations = Array.from(
      { length: 15 },
      (_, index) => `export const value${index} = ${index};`,
    ).join("\n");
    const missing = await lint(declarations);
    const documented = await lint(`
/** @fileoverview Groups configuration values so consumers use one import boundary. */
${declarations}
`);

    expect(missing.exitCode).toBe(0);
    expect(missing.output).toContain("rayhanadev(complex-file-header)");
    expect(documented.output).not.toContain("rayhanadev(complex-file-header)");
  });

  test("uses control-flow decisions and exempts pure barrels", async () => {
    const branches = Array.from(
      { length: 29 },
      (_, index) => `if (conditions[${index}]) consume(${index});`,
    ).join("\n");
    const complex = await lint(`function route() {\n${branches}\n}`);
    const barrel = await lint(
      Array.from(
        { length: 20 },
        (_, index) => `export { value${index} } from "./module-${index}.ts";`,
      ).join("\n"),
    );

    expect(complex.output).toContain("rayhanadev(complex-file-header)");
    expect(barrel.output).not.toContain("rayhanadev(complex-file-header)");
  });
});
