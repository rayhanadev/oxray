import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "jsonc-parser";

import packageJson from "../package.json" with { type: "json" };
import { personalRuleDefaults, personalRuleNames } from "../src/rule-names.ts";
import { applyScaffold, type ScaffoldOperations } from "../src/scaffold.ts";
import { createTemporaryProjects } from "./temporary-projects.ts";

const temporaryProjects = createTemporaryProjects(
  "oxray-scaffold-test-",
  `{
  "name": "fixture",
  "scripts": {
    "test": "bun test"
  }
}
`,
);

afterEach(async () => {
  await temporaryProjects.cleanup();
});

describe("project scaffolding", () => {
  test("installs the toolchain, initializes configs, and remains idempotent", async () => {
    const directory = await temporaryProjects.create();
    const addedPackages: string[][] = [];
    const addedRuntimePackages: string[][] = [];
    const initializedPackages: string[] = [];
    const operations: ScaffoldOperations = {
      async addDependency(packageNames) {
        addedRuntimePackages.push(Array.isArray(packageNames) ? packageNames : [packageNames]);
        return {};
      },
      async addDevDependency(packageNames) {
        addedPackages.push(Array.isArray(packageNames) ? packageNames : [packageNames]);
        return {};
      },
      async dlx(packageName, options) {
        initializedPackages.push(packageName);
        const filename = packageName === "oxlint" ? ".oxlintrc.json" : ".oxfmtrc.json";
        await Bun.write(join(options?.cwd ?? directory, filename), "{}\n");
        return {};
      },
      loadOxclippyRules() {
        return [["oxclippy/needless-bool", "warn"]];
      },
    };
    const options = {
      cwd: directory,
      packageManager: "bun" as const,
      presets: ["style"] as const,
      runtime: "bun" as const,
    };

    await applyScaffold(options, operations);

    expect(addedRuntimePackages[0]).toEqual(["better-result@^3"]);
    expect(addedPackages[0]).toEqual([
      `${packageJson.name}@${packageJson.version}`,
      "oxlint@latest",
      "oxfmt@latest",
      "oxlint-tsgolint@latest",
      "oxclippy@latest",
      "typescript@^7",
      "@types/bun@latest",
    ]);
    expect(initializedPackages).toEqual(["oxlint", "oxfmt"]);

    const packageJsonPath = join(directory, "package.json");
    const agentsPath = join(directory, "AGENTS.md");
    const oxlintPath = join(directory, ".oxlintrc.json");
    const oxfmtPath = join(directory, ".oxfmtrc.json");
    const firstPass = await Promise.all([
      readFile(packageJsonPath, "utf8"),
      readFile(oxlintPath, "utf8"),
      readFile(oxfmtPath, "utf8"),
      readFile(agentsPath, "utf8"),
    ]);
    const targetPackageJson = JSON.parse(firstPass[0]);
    const oxlint = parse(firstPass[1]);
    const oxfmt = JSON.parse(firstPass[2]);

    expect(targetPackageJson.scripts).toEqual({
      test: "bun test",
      format: "oxfmt",
      lint: "oxlint",
    });
    expect(oxlint.jsPlugins).toEqual([
      "oxclippy",
      { name: "rayhanadev", specifier: "@rayhanadev/ox" },
    ]);
    for (const ruleName of personalRuleNames) {
      expect(oxlint.rules[`rayhanadev/${ruleName}`]).toBe(personalRuleDefaults[ruleName]);
    }
    expect(oxlint.options.reportUnusedDisableDirectives).toBe("error");
    expect(oxlint.rules["oxclippy/needless-bool"]).toBe("warn");
    expect(oxfmt.sortImports).toBe(true);
    expect(oxfmt.ignorePatterns).toEqual(["AGENTS.md"]);
    expect(oxfmt.sortPackageJson).toBe(true);
    expect(oxfmt.sortTailwindcss).toBe(true);
    expect(firstPass[3]).toContain("<!-- oxray:comments:start -->");
    expect(firstPass[3]).toContain("<!-- oxray:comments:start -->\n## Error handling");
    expect(firstPass[3]).toContain("Result.tryPromise");
    expect(await Bun.file(join(directory, "CLAUDE.md")).exists()).toBe(false);

    await applyScaffold(options, operations);
    const secondPass = await Promise.all([
      readFile(packageJsonPath, "utf8"),
      readFile(oxlintPath, "utf8"),
      readFile(oxfmtPath, "utf8"),
      readFile(agentsPath, "utf8"),
    ]);

    expect(secondPass).toEqual(firstPass);
    expect(addedRuntimePackages).toEqual([["better-result@^3"], ["better-result@^3"]]);
    expect(initializedPackages).toEqual(["oxlint", "oxfmt"]);
  });
});
