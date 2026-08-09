#!/usr/bin/env node

import { cancel, intro, isCancel, log, multiselect, outro, select, spinner } from "@clack/prompts";
import { detectPackageManager, type PackageManagerName } from "nypm";

import packageJson from "../package.json" with { type: "json" };
import { oxclippyPresetNames, type OxclippyPresetName } from "./oxclippy-presets.ts";
import { inferRuntime, inspectProject, type ProjectPackageJson, type Runtime } from "./project.ts";
import { applyScaffold, type PackageManagerSelection } from "./scaffold.ts";

const supportedPackageManagers = ["bun", "npm", "pnpm", "yarn"] as const;

const presetDescriptions: { [preset in OxclippyPresetName]: string } = {
  recommended: "All non-pedantic Clippy ports",
  all: "Every oxclippy rule",
  style: "Style simplifications",
  complexity: "Unnecessary complexity",
  correctness: "Likely bugs",
  iterator: "Loop and array improvements",
  functions: "Function size and complexity",
  principles: "Standard library and combinator preferences",
  pedantic: "Opinionated naming and readability checks",
};

function finishPrompt<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Setup cancelled.");
    process.exit(0);
  }
  return value;
}

function isSupportedPackageManager(name: PackageManagerName): boolean {
  return supportedPackageManagers.includes(name as (typeof supportedPackageManagers)[number]);
}

async function choosePackageManager(cwd: string): Promise<PackageManagerSelection> {
  const detected = await detectPackageManager(cwd);
  if (detected && isSupportedPackageManager(detected.name)) {
    for (const warning of detected.warnings ?? []) {
      log.warn(warning);
    }
    return detected;
  }

  return finishPrompt(
    await select<PackageManagerName>({
      message: "Which package manager should oxray use?",
      initialValue: "bun",
      options: supportedPackageManagers.map((name) => ({ label: name, value: name })),
    }),
  );
}

async function chooseRuntime(cwd: string, targetPackageJson: ProjectPackageJson): Promise<Runtime> {
  const detected = await inferRuntime(cwd, targetPackageJson);
  if (detected) {
    return detected;
  }

  return finishPrompt(
    await select<Runtime>({
      message: "Which runtime does this project target?",
      initialValue: "bun",
      options: [
        { label: "Bun", value: "bun" },
        { label: "Node.js", value: "node" },
      ],
    }),
  );
}

async function choosePresets(): Promise<OxclippyPresetName[]> {
  return finishPrompt(
    await multiselect<OxclippyPresetName>({
      message: "Which oxclippy presets should be added?",
      initialValues: ["recommended"],
      required: true,
      options: oxclippyPresetNames.map((name) => ({
        hint: presetDescriptions[name],
        label: name,
        value: name,
      })),
    }),
  );
}

function printHelp(): void {
  console.log(`oxray ${packageJson.version}

Usage:
  oxray

Scaffold Oxlint, Oxfmt, type-aware linting, oxclippy, and oxray rules in the current package.`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }
  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    console.log(packageJson.version);
    return;
  }

  const cwd = process.cwd();
  const { packageJson: targetPackageJson } = await inspectProject(cwd);
  intro(`oxray v${packageJson.version}`);

  const packageManager = await choosePackageManager(cwd);
  const runtime = await chooseRuntime(cwd, targetPackageJson);
  const presets = await choosePresets();
  const progress = spinner();
  progress.start("Installing tools and merging configuration");
  try {
    await applyScaffold({ cwd, packageManager, presets, runtime });
    progress.stop("Oxlint and Oxfmt are ready");
  } catch (error) {
    progress.error("Setup failed");
    throw error;
  }
  outro("Run your new lint and format scripts.");
}

main().catch((error: unknown) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
