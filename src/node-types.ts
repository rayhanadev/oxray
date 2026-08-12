import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ProjectPackageJson } from "./project.ts";
import { pathExists } from "./project.ts";

function firstVersionLine(text: string): string | undefined {
  return text
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .find(Boolean);
}

function majorFromVersion(version: string | undefined): string | undefined {
  return version?.match(/^v?(\d+)(?:\.|$)/)?.[1];
}

async function readVersionRequest(cwd: string): Promise<string | undefined> {
  for (const filename of [".node-version", ".nvmrc"]) {
    const path = join(cwd, filename);
    if (await pathExists(path)) {
      return firstVersionLine(await readFile(path, "utf8"));
    }
  }
  return undefined;
}

function commandOutput(command: string, args: string[], cwd: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd }, (error, stdout) => {
      resolve(error ? undefined : stdout.trim());
    });
  });
}

function packageForVersion(version: string | undefined): string | undefined {
  const major = majorFromVersion(version);
  return major === undefined ? undefined : `@types/node@${major}`;
}

async function activeNodeTypesPackage(cwd: string): Promise<string> {
  return (
    packageForVersion(await commandOutput("fnm", ["current"], cwd)) ??
    packageForVersion(await commandOutput("node", ["--version"], cwd)) ??
    packageForVersion(process.versions.node) ??
    "@types/node@latest"
  );
}

/** Selects Node.js types from project declarations before it uses the active runtime version. */
export async function resolveNodeTypesPackage(
  cwd: string,
  packageJson: ProjectPackageJson,
): Promise<string> {
  const versionRequest = await readVersionRequest(cwd);
  if (versionRequest !== undefined) {
    const exactVersionPackage = packageForVersion(versionRequest);
    if (exactVersionPackage !== undefined) {
      return exactVersionPackage;
    }
    return activeNodeTypesPackage(cwd);
  }

  const engineRange = packageJson.engines?.node?.trim();
  if (engineRange) {
    return `@types/node@${engineRange}`;
  }

  return activeNodeTypesPackage(cwd);
}
