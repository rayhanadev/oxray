/**
 * @fileoverview Inspects project files before Oxray chooses a runtime or edits configuration.
 *
 * Runtime inference combines independent signals. It returns no choice when those signals conflict,
 * which lets the command ask the user instead of guessing.
 */
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseJsonc } from "./json-config.ts";

export type Runtime = "bun" | "node";

export interface ProjectPackageJson {
  dependencies?: { [packageName: string]: string };
  devDependencies?: { [packageName: string]: string };
  engines?: {
    node?: string;
  };
  optionalDependencies?: { [packageName: string]: string };
  peerDependencies?: { [packageName: string]: string };
}

export interface Project {
  packageJson: ProjectPackageJson;
}

const alternativeConfigs = [
  ".oxlintrc.jsonc",
  "oxlint.config.ts",
  "oxlint.config.mts",
  "oxlint.config.js",
  "oxlint.config.mjs",
  "oxlint.config.cjs",
  ".oxfmtrc.jsonc",
  "oxfmt.config.ts",
  "oxfmt.config.mts",
  "oxfmt.config.cts",
  "oxfmt.config.js",
  "oxfmt.config.mjs",
  "oxfmt.config.cjs",
] as const;

/** Checks a project signal without exposing missing-file errors to runtime inference. */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Reads project metadata once so runtime and package-manager decisions use consistent evidence. */
export async function inspectProject(cwd: string): Promise<Project> {
  const packageJsonPath = join(cwd, "package.json");
  if (!(await pathExists(packageJsonPath))) {
    throw new Error("No package.json found. Run ox from the package you want to configure.");
  }

  const conflicts = [];
  for (const filename of alternativeConfigs) {
    if (await pathExists(join(cwd, filename))) {
      conflicts.push(filename);
    }
  }
  if (conflicts.length > 0) {
    throw new Error(
      `Oxray writes .oxlintrc.json and .oxfmtrc.json. Remove or migrate conflicting config files first: ${conflicts.join(", ")}`,
    );
  }

  const packageJsonText = await readFile(packageJsonPath, "utf8");
  const packageJson = parseJsonc<ProjectPackageJson>(packageJsonText, "package.json");

  for (const filename of [".oxlintrc.json", ".oxfmtrc.json"]) {
    const path = join(cwd, filename);
    if (await pathExists(path)) {
      parseJsonc(await readFile(path, "utf8"), filename);
    }
  }

  return { packageJson };
}

function hasDependency(packageJson: ProjectPackageJson, dependency: string): boolean {
  return [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
  ].some((group) => group?.[dependency] !== undefined);
}

/** Infers one runtime only when project signals agree, so ambiguous projects can ask the user. */
export async function inferRuntime(
  cwd: string,
  packageJson: ProjectPackageJson,
): Promise<Runtime | undefined> {
  const bunSignal =
    hasDependency(packageJson, "@types/bun") || (await pathExists(join(cwd, "bunfig.toml")));
  const nodeSignal =
    hasDependency(packageJson, "@types/node") ||
    packageJson.engines?.node !== undefined ||
    (await pathExists(join(cwd, ".node-version"))) ||
    (await pathExists(join(cwd, ".nvmrc")));

  if (bunSignal === nodeSignal) {
    return undefined;
  }
  return bunSignal ? "bun" : "node";
}
