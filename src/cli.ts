#!/usr/bin/env node

import { cancel, intro, isCancel, log, multiselect, outro, select, spinner } from "@clack/prompts";
import { detectPackageManager, type PackageManagerName } from "nypm";

import packageJson from "../package.json" with { type: "json" };
import {
  individualOxclippyPresetNames,
  type IndividualOxclippyPresetName,
  type OxclippyPresetName,
} from "./oxclippy-presets.ts";
import { inferRuntime, inspectProject, type ProjectPackageJson, type Runtime } from "./project.ts";
import { applyScaffold, type PackageManagerSelection } from "./scaffold.ts";

const supportedPackageManagers = ["bun", "npm", "pnpm", "yarn"] as const;

type PresetSelection = "recommended" | "extensive" | "custom";

const presetDescriptions = {
  style: "Style simplifications",
  complexity: "Unnecessary complexity",
  correctness: "Likely bugs",
  iterator: "Loop and array improvements",
  functions: "Function size and complexity",
  principles: "Standard library and combinator preferences",
  pedantic: "Opinionated naming and readability checks",
} satisfies Record<IndividualOxclippyPresetName, string>;

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
      message: "Which package manager should ox use?",
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
  const selection = finishPrompt(
    await select<PresetSelection>({
      message: "Which oxclippy ruleset should be added?",
      initialValue: "recommended",
      options: [
        {
          hint: "All non-pedantic Clippy ports",
          label: "recommended",
          value: "recommended",
        },
        { hint: "Every oxclippy rule", label: "extensive", value: "extensive" },
        { hint: "Choose individual presets", label: "custom", value: "custom" },
      ],
    }),
  );

  if (selection === "recommended") {
    return ["recommended"];
  }
  if (selection === "extensive") {
    return ["all"];
  }

  return finishPrompt(
    await multiselect<IndividualOxclippyPresetName>({
      message: "Which individual oxclippy presets should be added?",
      required: true,
      options: individualOxclippyPresetNames.map((name) => ({
        hint: presetDescriptions[name],
        label: name,
        value: name,
      })),
    }),
  );
}

function printHelp(): void {
  console.log(`ox ${packageJson.version}

Usage:
  ox

Scaffold Oxlint, Oxfmt, oxclippy, and oxray in the current package.`);
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
  intro(`ox v${packageJson.version}`);

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
