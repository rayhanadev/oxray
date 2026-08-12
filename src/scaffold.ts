import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  addDependency,
  addDevDependency,
  dlx,
  type PackageManager,
  type PackageManagerName,
} from "nypm";

import packageJson from "../package.json" with { type: "json" };
import { mergeAgentsGuidance } from "./agents-guidance.ts";
import { mergeOxfmtConfig, mergeOxlintConfig, mergePackageJson } from "./json-config.ts";
import { resolveNodeTypesPackage } from "./node-types.ts";
import { loadOxclippyRules, type OxclippyPresetName } from "./oxclippy-presets.ts";
import { inspectProject, pathExists, type Runtime } from "./project.ts";

export type PackageManagerSelection = PackageManager | PackageManagerName;

export interface ScaffoldOptions {
  cwd: string;
  packageManager: PackageManagerSelection;
  presets: readonly OxclippyPresetName[];
  runtime: Runtime;
}

export interface ScaffoldOperations {
  addDependency: typeof addDependency;
  addDevDependency: typeof addDevDependency;
  dlx: typeof dlx;
  loadOxclippyRules: typeof loadOxclippyRules;
}

const defaultScaffoldOperations: ScaffoldOperations = {
  addDependency,
  addDevDependency,
  dlx,
  loadOxclippyRules,
};

async function initializeMissingConfig(
  cwd: string,
  filename: ".oxlintrc.json" | ".oxfmtrc.json",
  packageName: "oxlint" | "oxfmt",
  packageManager: PackageManagerSelection,
  operations: ScaffoldOperations,
): Promise<void> {
  const path = join(cwd, filename);
  if (await pathExists(path)) {
    return;
  }

  await operations.dlx(packageName, {
    args: ["--init"],
    cwd,
    packageManager,
  });
  if (!(await pathExists(path))) {
    throw new Error(`${packageName} did not create ${filename}`);
  }
}

async function writeIfChanged(path: string, original: string, next: string): Promise<void> {
  if (next !== original) {
    await writeFile(path, next);
  }
}

/** Installs and merges the selected toolchain so repeated setup remains safe. */
export async function applyScaffold(
  options: ScaffoldOptions,
  operations: ScaffoldOperations = defaultScaffoldOperations,
): Promise<void> {
  const { cwd, packageManager, presets, runtime } = options;
  const project = await inspectProject(cwd);
  const runtimeTypes =
    runtime === "bun"
      ? "@types/bun@latest"
      : await resolveNodeTypesPackage(cwd, project.packageJson);

  await operations.addDependency("better-result@^3", { cwd, packageManager });
  await operations.addDevDependency(
    [
      `${packageJson.name}@${packageJson.version}`,
      "oxlint@latest",
      "oxfmt@latest",
      "oxlint-tsgolint@latest",
      "oxclippy@latest",
      "typescript@^7",
      runtimeTypes,
    ],
    { cwd, packageManager },
  );

  await initializeMissingConfig(cwd, ".oxlintrc.json", "oxlint", packageManager, operations);
  await initializeMissingConfig(cwd, ".oxfmtrc.json", "oxfmt", packageManager, operations);

  const oxclippyRules = operations.loadOxclippyRules(cwd, presets);
  const packageJsonPath = join(cwd, "package.json");
  const agentsPath = join(cwd, "AGENTS.md");
  const oxlintPath = join(cwd, ".oxlintrc.json");
  const oxfmtPath = join(cwd, ".oxfmtrc.json");
  const [packageJsonText, oxlintText, oxfmtText, agentsText] = await Promise.all([
    readFile(packageJsonPath, "utf8"),
    readFile(oxlintPath, "utf8"),
    readFile(oxfmtPath, "utf8"),
    pathExists(agentsPath).then((exists) => (exists ? readFile(agentsPath, "utf8") : "")),
  ]);

  await Promise.all([
    writeIfChanged(packageJsonPath, packageJsonText, mergePackageJson(packageJsonText)),
    writeIfChanged(oxlintPath, oxlintText, mergeOxlintConfig(oxlintText, oxclippyRules)),
    writeIfChanged(oxfmtPath, oxfmtText, mergeOxfmtConfig(oxfmtText)),
    writeIfChanged(agentsPath, agentsText, mergeAgentsGuidance(agentsText)),
  ]);
}
