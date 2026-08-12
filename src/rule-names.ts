export type PersonalRuleSeverity = "error" | "warn";

export const personalRuleDefaults = {
  "comment-explains-why": "warn",
  "comment-ste100": "error",
  "comment-ste100-heuristics": "warn",
  "commented-out-code-requires-reason": "error",
  "complex-file-header": "warn",
  "cross-field-issue-without-path": "error",
  "domain-knowledge-in-agents": "error",
  "json-parse-argument-of-safeparse": "error",
  "lint-suppression-requires-reason": "error",
  "no-type-erasure": "error",
  "no-typeof": "error",
  "number-int-method": "error",
  "object-strict-method": "error",
  "optional-default-redundant": "error",
  "record-string-unknown": "error",
  "require-jsdoc-comments": "error",
  "shape-spread-drops-refinements": "error",
  "throwing-zod-refine": "error",
  "tool-input-integer-as-number": "error",
  "tool-input-not-strict": "error",
  "trim-after-string-constraint": "error",
  "union-of-literals-to-literal-array": "error",
  "zinfer-instead-of-zoutput": "error",
  "zod3-string-format-method": "error",
  "zodtype-annotation-instead-of-satisfies": "error",
  "zodtype-t-generic-helper": "error",
} as const;

export type PersonalRuleName = keyof typeof personalRuleDefaults;

export const personalRuleNames = Object.keys(personalRuleDefaults) as PersonalRuleName[];
