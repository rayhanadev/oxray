/**
 * @fileoverview Applies focused JSONC edits for Oxray project configuration.
 *
 * Each merge preserves unrelated values and comments. The scaffold can therefore run repeatedly
 * without replacing project-owned configuration.
 */
import {
  applyEdits,
  modify,
  parse,
  printParseErrorCode,
  type FormattingOptions,
  type ParseError,
} from "jsonc-parser";

import packageJson from "../package.json" with { type: "json" };
import { personalRuleDefaults, personalRuleNames } from "./rule-names.ts";

export type RuleSetting = string | number | readonly [string | number, ...unknown[]];
export type RuleEntry = readonly [name: string, setting: RuleSetting];

interface JsPlugin {
  name?: string;
  specifier?: string;
}

interface OxlintConfig {
  $schema?: string;
  jsPlugins?: Array<string | JsPlugin>;
  plugins?: string[];
}

interface OxfmtConfig {
  $schema?: string;
  ignorePatterns?: string[];
  sortImports?: unknown;
  sortPackageJson?: unknown;
  sortTailwindcss?: unknown;
}

const formattingOptions: FormattingOptions = {
  insertSpaces: true,
  tabSize: 2,
  eol: "\n",
};

/** Parses JSONC and names the source file because configuration errors need actionable locations. */
export function parseJsonc<T>(text: string, filename: string): T {
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const firstError = errors[0]!;
    throw new Error(
      `${filename} is invalid: ${printParseErrorCode(firstError.error)} at offset ${firstError.offset}`,
    );
  }
  if (value === null || Object(value) !== value || Array.isArray(value)) {
    throw new Error(`${filename} must contain a JSON object`);
  }
  return value as T;
}

function setJsonValue(text: string, path: Array<string | number>, value: unknown): string {
  return applyEdits(text, modify(text, path, value, { formattingOptions }));
}

function appendStrings(
  text: string,
  path: string,
  existing: string[] | undefined,
  required: readonly string[],
): string {
  if (existing === undefined) {
    return setJsonValue(text, [path], [...required]);
  }
  if (!Array.isArray(existing)) {
    throw new Error(`Expected "${path}" to be an array`);
  }

  let next = text;
  let length = existing.length;
  for (const value of required) {
    if (!existing.includes(value)) {
      next = setJsonValue(next, [path, length], value);
      existing.push(value);
      length += 1;
    }
  }
  return next;
}

function hasJsPlugin(plugins: Array<string | JsPlugin>, required: string | JsPlugin): boolean {
  return plugins.some((plugin) => {
    if (Object(required) !== required) {
      const specifier = required as string;
      if (plugin === specifier) {
        return true;
      }
      if (plugin === null || Object(plugin) !== plugin) {
        return false;
      }
      const entry = plugin as JsPlugin;
      return (
        entry.specifier === specifier && (entry.name === undefined || entry.name === specifier)
      );
    }

    if (plugin === null || Object(plugin) !== plugin) {
      return false;
    }
    const entry = plugin as JsPlugin;
    const requiredEntry = required as JsPlugin;
    return entry.name === requiredEntry.name && entry.specifier === requiredEntry.specifier;
  });
}

function appendJsPlugins(
  text: string,
  existing: Array<string | JsPlugin> | undefined,
  required: ReadonlyArray<string | JsPlugin>,
): string {
  if (existing === undefined) {
    return setJsonValue(text, ["jsPlugins"], [...required]);
  }
  if (!Array.isArray(existing)) {
    throw new Error('Expected "jsPlugins" to be an array');
  }

  let next = text;
  let length = existing.length;
  for (const plugin of required) {
    if (!hasJsPlugin(existing, plugin)) {
      next = setJsonValue(next, ["jsPlugins", length], plugin);
      existing.push(plugin);
      length += 1;
    }
  }
  return next;
}

/** Adds Oxray scripts while preserving unrelated package metadata and JSONC formatting. */
export function mergePackageJson(text: string): string {
  parseJsonc(text, "package.json");
  let next = setJsonValue(text, ["scripts", "format"], "oxfmt");
  next = setJsonValue(next, ["scripts", "lint"], "oxlint");
  return next;
}

/** Enables the selected policy while preserving existing plugins, rules, and JSONC comments. */
export function mergeOxlintConfig(text: string, oxclippyRules: readonly RuleEntry[]): string {
  const config = parseJsonc<OxlintConfig>(text, ".oxlintrc.json");
  let next = text;

  if (config.$schema === undefined) {
    next = setJsonValue(next, ["$schema"], "./node_modules/oxlint/configuration_schema.json");
  }
  const personalPlugin = { name: "rayhanadev", specifier: packageJson.name };
  next = appendStrings(next, "plugins", config.plugins, ["typescript", "unicorn", "oxc"]);
  next = appendJsPlugins(next, config.jsPlugins, ["oxclippy", personalPlugin]);
  next = setJsonValue(next, ["categories", "correctness"], "error");
  next = setJsonValue(next, ["options", "typeAware"], true);
  next = setJsonValue(next, ["options", "reportUnusedDisableDirectives"], "error");
  next = setJsonValue(next, ["env", "builtin"], true);
  for (const ruleName of personalRuleNames) {
    next = setJsonValue(next, ["rules", `rayhanadev/${ruleName}`], personalRuleDefaults[ruleName]);
  }

  for (const [ruleName, setting] of oxclippyRules) {
    next = setJsonValue(next, ["rules", ruleName], setting);
  }

  return next;
}

function enableOxfmtOption(
  text: string,
  name: "sortImports" | "sortPackageJson" | "sortTailwindcss",
  current: unknown,
): string {
  if (
    current === true ||
    (current !== null && Object(current) === current && !Array.isArray(current))
  ) {
    return text;
  }
  return setJsonValue(text, [name], true);
}

/** Enables stable sorting without replacing object-valued formatter options. */
export function mergeOxfmtConfig(text: string): string {
  const config = parseJsonc<OxfmtConfig>(text, ".oxfmtrc.json");
  let next = text;
  if (config.$schema === undefined) {
    next = setJsonValue(next, ["$schema"], "./node_modules/oxfmt/configuration_schema.json");
  }
  next = appendStrings(next, "ignorePatterns", config.ignorePatterns, ["AGENTS.md"]);
  next = enableOxfmtOption(next, "sortImports", config.sortImports);
  next = enableOxfmtOption(next, "sortPackageJson", config.sortPackageJson);
  next = enableOxfmtOption(next, "sortTailwindcss", config.sortTailwindcss);
  return next;
}
