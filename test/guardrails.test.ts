import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "jsonc-parser";

import {
  applyGuardrails,
  ensureAgentInstructions,
  type GuardrailOperations,
} from "../src/guardrails.ts";
import { personalRuleNames } from "../src/rule-names.ts";
import { createTemporaryProjects } from "./temporary-projects.ts";

const temporaryProjects = createTemporaryProjects(
  "oxray-guardrails-test-",
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

describe("project guardrails", () => {
  test("installs the toolchain, initializes configs, and remains idempotent", async () => {
    const directory = await temporaryProjects.create();
    const addedPackages: string[][] = [];
    const initializedPackages: string[] = [];
    const operations: GuardrailOperations = {
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

    await applyGuardrails(options, operations);

    expect(addedPackages[0]).toEqual([
      "@rayhanadev/ox@0.1.0",
      "oxlint@latest",
      "oxfmt@latest",
      "oxlint-tsgolint@latest",
      "oxclippy@latest",
      "typescript@^7",
      "@types/bun@latest",
    ]);
    expect(initializedPackages).toEqual(["oxlint", "oxfmt"]);

    const packageJsonPath = join(directory, "package.json");
    const oxlintPath = join(directory, ".oxlintrc.json");
    const oxfmtPath = join(directory, ".oxfmtrc.json");
    const agentsPath = join(directory, "AGENTS.md");
    const claudePath = join(directory, "CLAUDE.md");
    const firstPass = await Promise.all([
      readFile(packageJsonPath, "utf8"),
      readFile(oxlintPath, "utf8"),
      readFile(oxfmtPath, "utf8"),
      readFile(agentsPath, "utf8"),
      readFile(claudePath, "utf8"),
    ]);
    const packageJson = JSON.parse(firstPass[0]);
    const oxlint = parse(firstPass[1]);
    const oxfmt = JSON.parse(firstPass[2]);

    expect(packageJson.scripts).toEqual({
      test: "bun test",
      format: "oxfmt",
      lint: "oxlint",
    });
    expect(oxlint.jsPlugins).toEqual([
      "oxclippy",
      { name: "rayhanadev", specifier: "@rayhanadev/ox" },
    ]);
    for (const ruleName of personalRuleNames) {
      expect(oxlint.rules[`rayhanadev/${ruleName}`]).toBe("error");
    }
    expect(oxlint.rules["oxclippy/needless-bool"]).toBe("warn");
    expect(oxfmt.sortImports).toBe(true);
    expect(oxfmt.sortPackageJson).toBe(true);
    expect(oxfmt.sortTailwindcss).toBe(true);
    expect(firstPass[3]).toBe("You must never disable or suppress lint rules.\n");
    expect(firstPass[4]).toBe("See @AGENTS.md\n");

    await applyGuardrails(options, operations);
    const secondPass = await Promise.all([
      readFile(packageJsonPath, "utf8"),
      readFile(oxlintPath, "utf8"),
      readFile(oxfmtPath, "utf8"),
      readFile(agentsPath, "utf8"),
      readFile(claudePath, "utf8"),
    ]);

    expect(secondPass).toEqual(firstPass);
    expect(initializedPackages).toEqual(["oxlint", "oxfmt"]);
  });

  test("migrates existing Claude instructions", async () => {
    const directory = await temporaryProjects.create();
    await Bun.write(join(directory, "CLAUDE.md"), "# Project instructions\n\nUse Bun.\n");

    await ensureAgentInstructions(directory);

    expect(await readFile(join(directory, "AGENTS.md"), "utf8")).toBe(
      "# Project instructions\n\nUse Bun.\n\nYou must never disable or suppress lint rules.\n",
    );
    expect(await readFile(join(directory, "CLAUDE.md"), "utf8")).toBe("See @AGENTS.md\n");
  });

  test("preserves both existing instruction files", async () => {
    const directory = await temporaryProjects.create();
    await Promise.all([
      Bun.write(
        join(directory, "AGENTS.md"),
        "# Shared instructions\n\nYou must never disable or suppress lint rules.\n",
      ),
      Bun.write(join(directory, "CLAUDE.md"), "# Claude instructions\n"),
    ]);

    await ensureAgentInstructions(directory);

    expect(await readFile(join(directory, "AGENTS.md"), "utf8")).toBe(
      "# Shared instructions\n\nYou must never disable or suppress lint rules.\n\n# Claude instructions\n",
    );
    expect(await readFile(join(directory, "CLAUDE.md"), "utf8")).toBe("See @AGENTS.md\n");
  });
});
