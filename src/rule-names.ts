export const personalRuleNames = [
  "cross-field-issue-without-path",
  "json-parse-argument-of-safeparse",
  "no-type-erasure",
  "no-typeof",
  "number-int-method",
  "object-strict-method",
  "optional-default-redundant",
  "record-string-unknown",
  "shape-spread-drops-refinements",
  "throwing-zod-refine",
  "tool-input-integer-as-number",
  "tool-input-not-strict",
  "trim-after-string-constraint",
  "union-of-literals-to-literal-array",
  "zinfer-instead-of-zoutput",
  "zod3-string-format-method",
  "zodtype-annotation-instead-of-satisfies",
  "zodtype-t-generic-helper",
] as const;

export type PersonalRuleName = (typeof personalRuleNames)[number];
