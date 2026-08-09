import { expect, test } from "bun:test";

import { individualOxclippyPresetNames, loadOxclippyRules } from "../src/oxclippy-presets.ts";

test("lists only category presets for custom selection", () => {
  expect(individualOxclippyPresetNames).toEqual([
    "style",
    "complexity",
    "correctness",
    "iterator",
    "functions",
    "principles",
    "pedantic",
  ]);
});

test("loads rule data from oxclippy's published preset export", () => {
  const rules = new Map(loadOxclippyRules(process.cwd(), ["style"]));

  expect(rules.get("oxclippy/needless-bool")).toBe("warn");
  expect(rules.get("oxclippy/identity-op")).toBeUndefined();
});
