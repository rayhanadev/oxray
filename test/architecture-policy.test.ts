/** Verifies scaffolded policies against real files so configuration drift cannot silently remove coverage. */
import { afterAll, expect, test } from "bun:test";
import { realpath } from "node:fs/promises";
import { join } from "node:path";

import { mergeOxlintConfig } from "../src/json-config.ts";
import { createTemporaryProjects } from "./temporary-projects.ts";

const projects = createTemporaryProjects("oxray-architecture-", '{"type":"module"}');

afterAll(() => projects.cleanup());

async function lintProject(files: Record<string, string>, original = "{}") {
  const cwd = await realpath(await projects.create());
  // These fixtures exercise syntax and import policy. Config tests cover type-aware setup separately.
  const { plugins, rules, overrides } = JSON.parse(mergeOxlintConfig(original, []));
  const config = {
    plugins,
    rules,
    overrides,
    jsPlugins: [{ name: "rayhanadev", specifier: join(process.cwd(), "src/plugin.ts") }],
  };
  await Bun.write(join(cwd, ".oxlintrc.json"), JSON.stringify(config));
  await Bun.write(
    join(cwd, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { module: "esnext", target: "esnext" },
      include: ["**/*.ts"],
    }),
  );
  await Promise.all(
    Object.entries(files).map(([filename, code]) => Bun.write(join(cwd, filename), code)),
  );
  const child = Bun.spawn(
    [join(process.cwd(), "node_modules/.bin/oxlint"), "--config", join(cwd, ".oxlintrc.json"), cwd],
    { cwd, stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, output: stdout + stderr };
}

test("scaffolded policy rejects a dependency cycle across files", async () => {
  const result = await lintProject({
    "a.ts": 'import { b } from "./b.ts"; export const a = b;',
    "b.ts": 'import { a } from "./a.ts"; export const b = a;',
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain("no-cycle");
});

test("scaffolded policy rejects direct and indirect mutable exports", async () => {
  const result = await lintProject({
    "direct.ts": "export let active = true;",
    "indirect.ts": "let count = 0; count += 1; export { count as sharedCount };",
  });
  expect(result.exitCode).toBe(1);
  expect(result.output.match(/Exporting mutable/gu)).toHaveLength(2);
});

test.each(["bun:test", "@jest/globals", "vitest"])(
  "scaffolded policy rejects skipped tests from %s",
  async (runner) => {
    const result = await lintProject({
      "disabled.test.ts": `import { test } from "${runner}"; test.skip("disabled", () => {});`,
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/no-disabled-(?:bun-)?tests/u);
  },
);

test("preserves and enforces project import boundaries only in their configured scope", async () => {
  const policy = JSON.stringify({
    overrides: [
      {
        files: ["domain/**"],
        rules: { "no-restricted-imports": ["error", { patterns: ["**/adapters/**"] }] },
      },
    ],
  });
  const blocked = await lintProject(
    {
      "domain/order.ts": 'export { gateway } from "../adapters/payment";',
      "adapters/payment.ts": "export const gateway = 1;",
    },
    policy,
  );
  expect(blocked.exitCode).toBe(1);
  expect(blocked.output).toContain("no-restricted-imports");
  const allowed = await lintProject(
    {
      "app.ts": 'export { gateway } from "./adapters/payment";',
      "adapters/payment.ts": "export const gateway = 1;",
    },
    policy,
  );
  expect(allowed.exitCode).toBe(0);
});

test("scaffolded policy accepts an acyclic graph and active tests", async () => {
  const result = await lintProject({
    "value.ts": "export const value = 1;",
    "index.ts": 'export { value } from "./value";',
    "active.test.ts":
      'import {test, expect} from "bun:test"; import {value} from "./value"; test("value", () => { expect(value).toBe(1); });',
  });
  expect(result.exitCode).toBe(0);
});
