import { describe, expect, test } from "bun:test";

import { parse } from "jsonc-parser";

import { mergeOxfmtConfig, mergeOxlintConfig, mergePackageJson } from "../src/json-config.ts";
import { personalRuleNames } from "../src/rule-names.ts";

describe("JSONC config merging", () => {
  test("adds scripts without replacing unrelated package metadata", () => {
    const original = `{
  "name": "fixture",
  "scripts": {
    "test": "bun test"
  }
}
`;
    const merged = mergePackageJson(original);
    const packageJson = JSON.parse(merged);

    expect(packageJson.name).toBe("fixture");
    expect(packageJson.scripts).toEqual({
      test: "bun test",
      format: "oxfmt",
      lint: "oxlint",
    });
    expect(mergePackageJson(merged)).toBe(merged);
  });

  test("preserves comments and custom lint settings", () => {
    const original = `{
  // keep this project note
  "plugins": ["react"],
  "jsPlugins": [{ "name": "local", "specifier": "./local.js" }],
  "rules": {
    "eslint/no-console": "warn"
  }
}
`;
    const merged = mergeOxlintConfig(original, [
      ["oxclippy/needless-bool", "warn"],
      ["oxclippy/manual-clamp", "error"],
    ]);
    const config = parse(merged);

    expect(merged).toContain("// keep this project note");
    expect(config.plugins).toEqual(["react", "typescript", "unicorn", "oxc"]);
    expect(config.jsPlugins).toEqual([
      { name: "local", specifier: "./local.js" },
      "oxclippy",
      { name: "rayhanadev", specifier: "@rayhanadev/ox" },
    ]);
    expect(config.categories.correctness).toBe("error");
    expect(config.options.typeAware).toBe(true);
    expect(config.rules["eslint/no-console"]).toBe("warn");
    for (const ruleName of personalRuleNames) {
      expect(config.rules[`rayhanadev/${ruleName}`]).toBe("error");
    }
    expect(config.rules["oxclippy/needless-bool"]).toBe("warn");
    expect(config.rules["oxclippy/manual-clamp"]).toBe("error");
    expect(mergeOxlintConfig(merged, [])).toBe(merged);
  });

  test("enables formatter sorting without replacing option objects", () => {
    const original = `{
  "sortImports": {
    "newlinesBetween": false
  },
  "sortPackageJson": false
}
`;
    const merged = mergeOxfmtConfig(original);
    const config = JSON.parse(merged);

    expect(config.sortImports).toEqual({ newlinesBetween: false });
    expect(config.sortPackageJson).toBe(true);
    expect(config.sortTailwindcss).toBe(true);
    expect(mergeOxfmtConfig(merged)).toBe(merged);
  });

  test("rejects malformed JSONC before editing", () => {
    expect(() => mergePackageJson('{ "name": ')).toThrow("package.json is invalid");
  });
});
