import { createRequire } from "node:module";
import { join } from "node:path";

import type { RuleEntry, RuleSetting } from "./json-config.ts";

export const individualOxclippyPresetNames = [
  "style",
  "complexity",
  "correctness",
  "iterator",
  "functions",
  "principles",
  "pedantic",
] as const;

export const oxclippyPresetNames = [
  "recommended",
  "all",
  ...individualOxclippyPresetNames,
] as const;

export type OxclippyPresetName = (typeof oxclippyPresetNames)[number];
export type IndividualOxclippyPresetName = (typeof individualOxclippyPresetNames)[number];

interface OxclippyPreset {
  rules: { [ruleName: string]: RuleSetting };
}

export function loadOxclippyRules(
  cwd: string,
  presetNames: readonly OxclippyPresetName[],
): RuleEntry[] {
  const requireFromTarget = createRequire(join(cwd, "package.json"));
  const rules = new Map<string, RuleSetting>();

  for (const presetName of presetNames) {
    const preset = requireFromTarget(`oxclippy/presets/${presetName}.json`) as OxclippyPreset;
    for (const [ruleName, setting] of Object.entries(preset.rules)) {
      rules.set(ruleName, setting);
    }
  }

  return [...rules.entries()];
}
