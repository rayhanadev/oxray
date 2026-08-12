import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  betterResultRuleNames,
  personalRuleDefaults,
  personalRuleNames,
  type PersonalRuleName,
} from "../src/rule-names.ts";

let fixtureDirectory: string;
let fixtureNumber = 0;
const betterResultRules = new Set<PersonalRuleName>(betterResultRuleNames);

function ruleSettings(enabledBetterResultRules: readonly PersonalRuleName[] = []) {
  const enabled = new Set(enabledBetterResultRules);
  return Object.fromEntries(
    personalRuleNames.map((ruleName) => [
      `rayhanadev/${ruleName}`,
      betterResultRules.has(ruleName) && !enabled.has(ruleName)
        ? "off"
        : personalRuleDefaults[ruleName],
    ]),
  );
}

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
        rules: ruleSettings(),
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

interface LintOptions {
  filename?: string;
  fixSuggestions?: boolean;
  flags?: readonly string[];
  rules?: readonly PersonalRuleName[];
}

async function lint(
  code: string,
  options: LintOptions = {},
): Promise<{ code: string; exitCode: number; output: string }> {
  fixtureNumber += 1;
  const { filename, flags = [] } = options;
  const fixturePath = join(fixtureDirectory, filename ?? `fixture-${fixtureNumber}.ts`);
  await Bun.write(fixturePath, code);
  let configPath = join(fixtureDirectory, ".oxlintrc.json");
  if (options.rules && options.rules.length > 0) {
    configPath = join(fixtureDirectory, `.oxlintrc-${fixtureNumber}.json`);
    await Bun.write(
      configPath,
      JSON.stringify(
        {
          jsPlugins: [
            {
              name: "rayhanadev",
              specifier: join(process.cwd(), "src/plugin.ts"),
            },
          ],
          rules: ruleSettings(options.rules),
        },
        null,
        2,
      ),
    );
  }
  const child = Bun.spawn(
    [
      join(process.cwd(), "node_modules/.bin/oxlint"),
      "--config",
      configPath,
      ...flags,
      ...(options.fixSuggestions ? ["--fix-suggestions"] : []),
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
function isUser(value: unknown): value is User { return Boolean(value); }
isUser(value);
Reflect.has(Object(value), "id");
`);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("rayhanadev(");
  });

  const invalidCases = [
    ["type Data = object;", "broad object type"],
    ["type Data = Object;", "Object type"],
    ["type Data = {};", "empty object type"],
    ["interface Data {}", "empty interface"],
    ["isRecord(value);", "direct isRecord call"],
    ["guards.isRecord(value);", "member isRecord call"],
    ['guards["isRecord"](value);', "computed isRecord call"],
    ["guards.isRecord?.(value);", "optional isRecord call"],
    ["Object(value) === value;", "Object identity check"],
    ["value === Object(value);", "reversed Object identity check"],
    ["Object(value) !== value;", "negative Object identity check"],
    ["record.value != Object(record.value);", "member Object identity check"],
  ] as const;

  for (const [code, name] of invalidCases) {
    test(`reports ${name}`, async () => {
      const result = await lint(code);

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("rayhanadev(no-type-erasure)");
    });
  }
});

describe("no-unsafe-dictionary-type", () => {
  test("accepts concrete dictionary values", async () => {
    const result = await lint(`
interface User { id: string }
type Users = Record<string, User>;
type Indexed = { [key: string]: User };
`);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("rayhanadev(no-unsafe-dictionary-type)");
  });

  const invalidCases = [
    "type Data = Record<string, unknown>;",
    "type Data = Record<string, any>;",
    "type Data = { [key: string]: unknown };",
    "interface Data { [key: string]: any }",
    "type Value = unknown;\ntype Data = Record<string, Value>;",
    "interface Empty {}\ntype Data = Readonly<Record<string, Empty>>;",
  ];

  for (const code of invalidCases) {
    test(`reports ${code}`, async () => {
      const result = await lint(code);

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("rayhanadev(no-unsafe-dictionary-type)");
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

describe("better-result policy rules", () => {
  test("blocks direct exception and Promise rejection control flow", async () => {
    const result = await lint(
      `
function load() {
  try {
    return Promise.reject(new Error("missing"));
  } catch (error) {
    throw error;
  }
}
request().catch(recover);
request().then(use, recover);
new Promise((resolve, reject) => reject(error));
`,
      {
        rules: ["no-promise-catch", "no-promise-reject", "no-throw", "no-try-catch"],
      },
    );

    expect(result.exitCode).toBe(1);
    for (const ruleName of ["no-promise-catch", "no-promise-reject", "no-throw", "no-try-catch"]) {
      expect(result.output).toContain(`rayhanadev(${ruleName})`);
    }
  });

  test("allows cleanup and explicit panic without catch or throw syntax", async () => {
    const result = await lint(
      `
import { panic } from "better-result";
try {
  use(resource);
} finally {
  close(resource);
}
if (broken) panic("Invariant failed", state);
`,
      { rules: ["no-throw", "no-try-catch"] },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("rayhanadev(no-throw)");
    expect(result.output).not.toContain("rayhanadev(no-try-catch)");
  });

  test("blocks mixed nullable sentinels but allows Boolean branches", async () => {
    const result = await lint(
      `
function findUser(found) {
  if (!found) return null;
  return { id: "user-1" };
}
const findName = (found) => found ? "Ray" : undefined;
const isReady = (ready) => ready ? true : false;
`,
      { rules: ["no-error-sentinel"] },
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(no-error-sentinel)");
  });

  test("allows single-lane sentinels and isolated transport objects", async () => {
    const result = await lint(
      `
function absent() {
  return null;
}
function transport(value) {
  return { ok: true, value };
}
const isReady = (ready) => ready ? true : false;
`,
      { rules: ["no-ad-hoc-result", "no-error-sentinel"] },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("rayhanadev(no-ad-hoc-result)");
    expect(result.output).not.toContain("rayhanadev(no-error-sentinel)");
  });

  test("blocks object and tuple result envelopes", async () => {
    const result = await lint(
      `
function loadObject(found) {
  if (found) return { ok: true, value: found };
  return { ok: false, error: "missing" };
}
function loadTuple(found) {
  return found ? [found, null] : [null, "missing"];
}
`,
      { rules: ["no-ad-hoc-result"] },
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(no-ad-hoc-result)");
  });

  test("requires TaggedError for expected failures", async () => {
    const result = await lint(
      `
import { Result, TaggedError } from "better-result";
class Missing extends Error {}
class Invalid extends TaggedError("Invalid")<{ message: string }> {}
Result.err("missing");
Result.err(new Error("missing"));
Result.err(new Invalid({ message: "invalid" }));
function invalidReturn() { return new Error("missing"); }
`,
      { rules: ["require-tagged-error"] },
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(require-tagged-error)");
  });

  test("blocks known Result unwrap assertions", async () => {
    const result = await lint(
      `
import { Result as R } from "better-result";
R.try(read).unwrap();
R.unwrap(R.ok(1));
unrelated.unwrap();
`,
      { rules: ["no-result-unwrap"] },
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(no-result-unwrap)");
  });

  test("checks async construction and generator contracts", async () => {
    const result = await lint(
      `
import * as Better from "better-result";
Better.Result.try(async () => loadUser());
Better.Result.try({ try: async () => loadUser(), catch: toError });
Better.Result.gen(function* () {
  return user;
});
Better.Result.gen(function* () {
  consume(user);
});
Better.Result.gen(async function* () {
  const user = yield* await loadUser();
  return Better.Result.ok(user);
});
`,
      {
        rules: ["no-async-result-try", "prefer-result-await", "require-result-gen-return"],
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(no-async-result-try)");
    expect(result.output).toContain("rayhanadev(prefer-result-await)");
    expect(result.output).toContain("rayhanadev(require-result-gen-return)");
  });

  test("ignores unrelated Result bindings", async () => {
    const result = await lint(
      `
const Result = makeResultApi();
Result.try(async () => load());
Result.gen(function* () { return value; });
Result.try(read).unwrap();
`,
      {
        rules: ["no-async-result-try", "no-result-unwrap", "require-result-gen-return"],
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("rayhanadev(");
  });

  test("requires Result boundaries around known throwing APIs", async () => {
    const result = await lint(
      `
import { Result } from "better-result";
import { readFile } from "node:fs/promises";
import { z } from "zod/v4";

Result.try(() => JSON.parse(input));
Result.tryPromise(() => fetch(url));
JSON.parse(input);
fetch(url);
Result.try(() => fetch(url));
readFile(path);
new URL(input);
z.string().parse(input);
Result.try(() => z.string().parse(input));
import(moduleName);
`,
      { rules: ["wrap-throwing-api"] },
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(wrap-throwing-api)");
  });

  test("accepts known APIs inside matching Result boundaries", async () => {
    const result = await lint(
      `
import * as Better from "better-result";
import { readFile } from "node:fs/promises";

Better.Result.try({
  try: () => JSON.parse(input),
  catch: toParseError,
});
Better.Result.try({
  try: () => new URL(input),
  catch: toUrlError,
});
Better.Result.tryPromise({
  try: () => fetch(url),
  catch: toNetworkError,
});
Better.Result.tryPromise({
  try: () => readFile(path, "utf8"),
  catch: toFileError,
});
Better.Result.tryPromise({
  try: () => response.json(),
  catch: toResponseError,
});
`,
      { rules: ["wrap-throwing-api"] },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("rayhanadev(wrap-throwing-api)");
  });

  test("applies local better-result suggestions", async () => {
    const asyncTry = await lint(
      `
import { Result } from "better-result";
const response = Result.try(async () => fetch(url));
`,
      { fixSuggestions: true, rules: ["no-async-result-try"] },
    );
    const generatorReturn = await lint(
      `
import { Result as R } from "better-result";
const result = R.gen(function* () { return value; });
`,
      { fixSuggestions: true, rules: ["require-result-gen-return"] },
    );
    const resultAwait = await lint(
      `
import { Result } from "better-result";
const result = Result.gen(async function* () {
  const user = yield* await loadUser();
  return Result.ok(user);
});
`,
      { fixSuggestions: true, rules: ["prefer-result-await"] },
    );

    expect(asyncTry.code).toContain("Result.tryPromise(async");
    expect(generatorReturn.code).toContain("return R.ok(value)");
    expect(resultAwait.code).toContain("yield* Result.await(loadUser())");
  });
});

describe("selected anti-slop rules", () => {
  test("allows one assertion that preserves a direct review point", async () => {
    const result = await lint(`
const user = input as User;
const values = [1, 2] as const;
`);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("rayhanadev(no-chained-type-assertions)");
  });

  test("reports chained as and angle-bracket assertions", async () => {
    const result = await lint(`
const first = input as unknown as User;
const second = (<unknown>input) as User;
`);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(no-chained-type-assertions)");
  });

  test("reports conditional empty-object spreads", async () => {
    const result = await lint(`
const options = {
  ...(enabled ? { enabled } : {}),
};
`);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(no-conditional-empty-object-spread)");
  });

  test("reports known values widened through explicit broad targets", async () => {
    const invalid = await lint(`
const handlers: Record<string, Handler> = {
  start: startHandler,
};
`);
    const valid = await lint(`
const handlers = {
  start: startHandler,
} satisfies Record<string, Handler>;
`);

    expect(invalid.exitCode).toBe(1);
    expect(invalid.output).toContain("rayhanadev(no-known-value-widening)");
    expect(valid.output).not.toContain("rayhanadev(no-known-value-widening)");
  });

  test("reports aliases that only conceal unknown", async () => {
    const result = await lint(`
type ExternalValue = unknown;
type RenamedValue = ExternalValue;
`);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(no-unknown-type-aliases)");
  });

  test("reports local values widened and asserted back", async () => {
    const result = await lint(`
const loaded: User = loadUser();
const stored: unknown = loaded;
const user = stored as User;
`);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(no-widen-then-assert)");
  });
});

describe("file and export organization", () => {
  test("accepts focused dedicated files", async () => {
    const cases = [
      [
        "types.ts",
        "export interface User { id: string }\nexport type UserId = string;",
        "types-file-organization",
      ],
      ["enums.ts", 'export enum Role { Admin = "admin" }', "enum-file-organization"],
      ["constants.ts", "export const RETRY_LIMIT = 3;", "constants-file-organization"],
      [
        "errors.ts",
        "/** Preserves the response status because callers render it. */\nexport class RequestError extends Error {}",
        "errors-file-organization",
      ],
      [
        "schemas.ts",
        'import { z } from "zod/v4";\nexport const userSchema = z.strictObject({ id: z.string() });\nexport type User = z.infer<typeof userSchema>;',
        "schemas-file-organization",
      ],
    ] as const;

    for (const [filename, code, ruleName] of cases) {
      const result = await lint(code, { filename });

      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain(`rayhanadev(${ruleName})`);
    }
  });

  test("reports declarations that conflict with dedicated filenames", async () => {
    const cases = [
      ["types.ts", 'import "./setup.ts";\nexport const value = 1;', "types-file-organization"],
      ["enums.ts", 'export const role = "admin";', "enum-file-organization"],
      ["constants.ts", "export type RetryLimit = number;", "constants-file-organization"],
      ["errors.ts", "export interface ClientError {}", "errors-file-organization"],
      ["schemas.ts", "export type User = { id: string };", "schemas-file-organization"],
    ] as const;

    for (const [filename, code, ruleName] of cases) {
      const result = await lint(code, { filename });

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(`rayhanadev(${ruleName})`);
    }
  });

  test("matches separator-insensitive filenames to named default exports", async () => {
    const valid = await lint("const UserClient = {};\nexport default UserClient;", {
      filename: "user-client.ts",
    });
    const invalid = await lint("const UserClient = {};\nexport default UserClient;", {
      filename: "client.ts",
    });

    expect(valid.exitCode).toBe(0);
    expect(valid.output).not.toContain("rayhanadev(filename-match-export)");
    expect(invalid.exitCode).toBe(1);
    expect(invalid.output).toContain("rayhanadev(filename-match-export)");
    expect(invalid.output).toContain("user-client.ts");
  });

  test("requires declarations for direct, indirect, and default function exports", async () => {
    const valid = await lint(`
/** Loads a user because the command needs current account data. */
export function loadUser() {}
`);
    const invalid = await lint(`
/** Loads a user because the command needs current account data. */
export const loadUser = () => {};
/** Saves a user because the command changed account data. */
const saveUser = function () {};
export { saveUser };
export default (() => {});
`);

    expect(valid.exitCode).toBe(0);
    expect(valid.output).not.toContain("rayhanadev(no-exported-function-expressions)");
    expect(invalid.exitCode).toBe(1);
    expect(invalid.output).toContain("rayhanadev(no-exported-function-expressions)");
  });
});

describe("Zod 4 rules", () => {
  const nonZodRuleNames = new Set([
    ...betterResultRuleNames,
    "comment-explains-why",
    "comment-ste100",
    "comment-ste100-heuristics",
    "commented-out-code-requires-reason",
    "complex-file-header",
    "constants-file-organization",
    "domain-knowledge-in-agents",
    "enum-file-organization",
    "errors-file-organization",
    "filename-match-export",
    "lint-suppression-requires-reason",
    "no-chained-type-assertions",
    "no-conditional-empty-object-spread",
    "no-exported-function-expressions",
    "no-known-value-widening",
    "no-type-erasure",
    "no-typeof",
    "no-unknown-type-aliases",
    "no-unsafe-dictionary-type",
    "no-widen-then-assert",
    "require-jsdoc-comments",
    "schemas-file-organization",
    "types-file-organization",
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
z.unknown();
z.codec(z.string(), z.json(), {
  decode: (text) => JSON.parse(text),
  encode: (value) => JSON.stringify(value),
});
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
import { Result } from "better-result";
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
Result.try(() => schema.safeParse(JSON.parse(text)));
z.json();
z.strictObject({ id: z.string() });
z.custom<User>(isUser);
z.codec(z.iso.datetime(), z.date(), {
  decode: (text) => new Date(text),
  encode: (value) => value.toISOString(),
});
z.string().refine((value) => {
  return Result.try(() => new URL(value).hostname.length > 0).unwrapOr(false);
});
try {
  z.string().refine((value) => {
    return Result.try(() => JSON.parse(value)).isOk();
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
  providerMetadata: z.record(z.string(), z.json()),
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

  test("requires a Result boundary inside the refinement callback", async () => {
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

  test("requires Result.try around JSON parsing even inside try/catch", async () => {
    const result = await lint(`
import { z } from "zod/v4";
try {
  z.string().safeParse(JSON.parse(text));
} catch {}
`);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(json-parse-argument-of-safeparse)");
    expect(result.output).toContain("Capture JSON.parse with Result.try");
    expect(result.output).not.toContain("JSON codec");
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
z3.unknown();
z3.any();
z3.object({});
z3.codec(z3.string(), z3.unknown(), {
  decode: JSON.parse,
  encode: JSON.stringify,
});

const z = makeUnrelatedBuilder();
z.string().url();
z.number().int();
z.unknown();
z.any();
z.object({});
z.codec(z.string(), z.unknown(), {
  decode: JSON.parse,
  encode: JSON.stringify,
});
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
export const publicSchema: z.ZodType<Node> = z.object({ children: z.array(z.json()) });

function codec<Output, Input>(schema: z.ZodType<Output, Input>) {
  return schema;
}
function factory<Output>(options: { schema: z.ZodType<Output> }) {
  return options.schema;
}

const providerMetadata = z.record(z.string(), z.json());
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

  const erasedZodSchemaCases = [
    ["schema.unknown();", "unknown schema"],
    ['schema["any"]();', "any schema"],
    ["schema.object({});", "empty object schema"],
    ["schema.looseObject({});", "empty loose object schema"],
    ["schema.custom<User>();", "custom schema without a predicate"],
    ["schema.custom<User>(undefined);", "custom schema with an undefined predicate"],
  ] as const;

  for (const [code, name] of erasedZodSchemaCases) {
    test(`rejects ${name}`, async () => {
      const result = await lint(`
import { z as schema } from "zod/v4";
type User = { id: string };
${code}
`);

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("rayhanadev(no-zod-type-erasure)");
    });
  }

  test("accepts schemas that preserve concrete runtime information", async () => {
    const result = await lint(`
import { z } from "zod/v4";
type User = { id: string };

z.json();
z.record(z.string(), z.json());
z.object({ id: z.string() });
z.strictObject({});
z.strictObject({ id: z.string() });
z.looseObject({ id: z.string() });
z.custom<User>(isUser);
`);

    expect(result.output).not.toContain("rayhanadev(no-zod-type-erasure)");
  });

  test("keeps the specialized tool record diagnostic", async () => {
    const result = await lint(`
import { z } from "zod/v4";
defineTool({
  input: z.strictObject({
    metadata: z.record(z.string(), z.unknown()),
  }),
});
`);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("rayhanadev(record-string-unknown)");
    expect(result.output).not.toContain("rayhanadev(no-zod-type-erasure)");
  });

  const invalidJsonCodecCases = [
    [
      `
function jsonCodec<S extends schema.ZodType>(valueSchema: S) {
  return schema.codec(schema.string(), valueSchema, {
    decode(text, payload) {
      try {
        return JSON["parse"](text);
      } catch (cause) {
        payload.issues.push({
          code: "invalid_format",
          format: "json",
          input: text,
          message: cause instanceof Error ? cause.message : "invalid JSON",
        });
        return schema.NEVER;
      }
    },
    encode: JSON.stringify,
  });
}
`,
      "guarded parsing and a direct stringify reference",
    ],
    [
      `
schema["codec"](schema.json(), schema.string(), {
  decode: JSON.stringify,
  encode: JSON.parse,
});
`,
      "the inverted JSON operation pair",
    ],
  ] as const;

  for (const [code, name] of invalidJsonCodecCases) {
    test(`rejects a JSON codec with ${name}`, async () => {
      const result = await lint(`
import { z as schema } from "zod/v4";
${code}
`);

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("rayhanadev(no-json-parse-stringify-codec)");
    });
  }

  test("accepts domain codecs and unrelated JSON operations", async () => {
    const result = await lint(`
import { z } from "zod/v4";

z.codec(z.iso.datetime(), z.date(), {
  decode: (text) => new Date(text),
  encode: (value) => value.toISOString(),
});
const parsed = JSON.parse(text);
const serialized = JSON.stringify(parsed);
`);

    expect(result.output).not.toContain("rayhanadev(no-json-parse-stringify-codec)");
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
      { flags: ["--fix"] },
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
import { Result } from "better-result";
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
    const safeResult = await lint(source, { flags: ["--fix"] });

    expect(safeResult.exitCode).toBe(1);
    expect(safeResult.code).toBe(source);

    const suggestedResult = await lint(source, { flags: ["--fix-suggestions"] });

    expect(suggestedResult.exitCode).toBe(0);
    expect(suggestedResult.code).toContain("input: z.strictObject({");
    expect(suggestedResult.code).toContain("pull_number: z.int()");
    expect(suggestedResult.code).toContain("name: z.string().trim().min(1)");
    expect(suggestedResult.code).toContain(
      'ctx.addIssue({ path: ["name"], code: "custom", message: "name is required" })',
    );
    expect(suggestedResult.code).toContain(
      "(value) => Result.try(() => new URL(value).hostname.length > 0).unwrapOr(false)",
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
