import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { addDevDependency, dlx, type PackageManager, type PackageManagerName } from "nypm";

import packageJson from "../package.json" with { type: "json" };
import { mergeOxfmtConfig, mergeOxlintConfig, mergePackageJson } from "./json-config.ts";
import { resolveNodeTypesPackage } from "./node-types.ts";
import { loadOxclippyRules, type OxclippyPresetName } from "./oxclippy-presets.ts";
import { inspectProject, pathExists, type Runtime } from "./project.ts";

export type PackageManagerSelection = PackageManager | PackageManagerName;

export interface GuardrailOptions {
  cwd: string;
  packageManager: PackageManagerSelection;
  presets: readonly OxclippyPresetName[];
  runtime: Runtime;
}

export interface GuardrailOperations {
  addDevDependency: typeof addDevDependency;
  dlx: typeof dlx;
  loadOxclippyRules: typeof loadOxclippyRules;
}

const defaultGuardrailOperations: GuardrailOperations = {
  addDevDependency,
  dlx,
  loadOxclippyRules,
};

const claudeRedirect = "See @AGENTS.md\n";
const lintGuardrail = "You must never disable or suppress lint rules.";

async function initializeMissingConfig(
  cwd: string,
  filename: ".oxlintrc.json" | ".oxfmtrc.json",
  packageName: "oxlint" | "oxfmt",
  packageManager: PackageManagerSelection,
  operations: GuardrailOperations,
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

function appendBlock(content: string, block: string): string {
  if (content.includes(block)) {
    return content;
  }

  let separator = "\n\n";
  if (content.length === 0 || content.endsWith("\n\n")) {
    separator = "";
  } else if (content.endsWith("\n")) {
    separator = "\n";
  }
  return `${content}${separator}${block}\n`;
}

export async function ensureAgentInstructions(cwd: string): Promise<void> {
  const agentsPath = join(cwd, "AGENTS.md");
  const claudePath = join(cwd, "CLAUDE.md");
  const [agentsExists, claudeExists] = await Promise.all([
    pathExists(agentsPath),
    pathExists(claudePath),
  ]);
  let agentsText = agentsExists ? await readFile(agentsPath, "utf8") : "";
  let currentAgentsText = agentsText;
  const claudeText = claudeExists ? await readFile(claudePath, "utf8") : "";
  const hasLegacyClaudeInstructions = claudeExists && claudeText.trim() !== claudeRedirect.trim();

  if (hasLegacyClaudeInstructions) {
    if (!agentsExists) {
      await rename(claudePath, agentsPath);
      currentAgentsText = claudeText;
    }
    agentsText = appendBlock(agentsText, claudeText.trimEnd());
  }

  const nextAgentsText = appendBlock(agentsText, lintGuardrail);
  await Promise.all([
    writeIfChanged(agentsPath, currentAgentsText, nextAgentsText),
    writeIfChanged(
      claudePath,
      hasLegacyClaudeInstructions && !agentsExists ? "" : claudeText,
      claudeRedirect,
    ),
  ]);
}

export async function applyGuardrails(
  options: GuardrailOptions,
  operations: GuardrailOperations = defaultGuardrailOperations,
): Promise<void> {
  const { cwd, packageManager, presets, runtime } = options;
  const project = await inspectProject(cwd);
  const runtimeTypes =
    runtime === "bun"
      ? "@types/bun@latest"
      : await resolveNodeTypesPackage(cwd, project.packageJson);

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
  const oxlintPath = join(cwd, ".oxlintrc.json");
  const oxfmtPath = join(cwd, ".oxfmtrc.json");
  const [packageJsonText, oxlintText, oxfmtText] = await Promise.all([
    readFile(packageJsonPath, "utf8"),
    readFile(oxlintPath, "utf8"),
    readFile(oxfmtPath, "utf8"),
  ]);

  await Promise.all([
    writeIfChanged(packageJsonPath, packageJsonText, mergePackageJson(packageJsonText)),
    writeIfChanged(oxlintPath, oxlintText, mergeOxlintConfig(oxlintText, oxclippyRules)),
    writeIfChanged(oxfmtPath, oxfmtText, mergeOxfmtConfig(oxfmtText)),
    ensureAgentInstructions(cwd),
  ]);
}
