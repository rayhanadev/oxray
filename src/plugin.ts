import packageJson from "../package.json" with { type: "json" };
import type { PersonalRuleName } from "./rule-names.ts";
import crossFieldIssueWithoutPath from "./rules/cross-field-issue-without-path.ts";
import jsonParseArgumentOfSafeparse from "./rules/json-parse-argument-of-safeparse.ts";
import noTypeErasure from "./rules/no-type-erasure.ts";
import noTypeof from "./rules/no-typeof.ts";
import numberIntMethod from "./rules/number-int-method.ts";
import objectStrictMethod from "./rules/object-strict-method.ts";
import optionalDefaultRedundant from "./rules/optional-default-redundant.ts";
import recordStringUnknown from "./rules/record-string-unknown.ts";
import shapeSpreadDropsRefinements from "./rules/shape-spread-drops-refinements.ts";
import throwingZodRefine from "./rules/throwing-zod-refine.ts";
import toolInputIntegerAsNumber from "./rules/tool-input-integer-as-number.ts";
import toolInputNotStrict from "./rules/tool-input-not-strict.ts";
import trimAfterStringConstraint from "./rules/trim-after-string-constraint.ts";
import type { OxlintRule } from "./rules/types.ts";
import unionOfLiteralsToLiteralArray from "./rules/union-of-literals-to-literal-array.ts";
import zinferInsteadOfZoutput from "./rules/zinfer-instead-of-zoutput.ts";
import zod3StringFormatMethod from "./rules/zod3-string-format-method.ts";
import zodtypeAnnotationInsteadOfSatisfies from "./rules/zodtype-annotation-instead-of-satisfies.ts";
import zodtypeTGenericHelper from "./rules/zodtype-t-generic-helper.ts";

const rules = {
  "cross-field-issue-without-path": crossFieldIssueWithoutPath,
  "json-parse-argument-of-safeparse": jsonParseArgumentOfSafeparse,
  "no-type-erasure": noTypeErasure,
  "no-typeof": noTypeof,
  "number-int-method": numberIntMethod,
  "object-strict-method": objectStrictMethod,
  "optional-default-redundant": optionalDefaultRedundant,
  "record-string-unknown": recordStringUnknown,
  "shape-spread-drops-refinements": shapeSpreadDropsRefinements,
  "throwing-zod-refine": throwingZodRefine,
  "tool-input-integer-as-number": toolInputIntegerAsNumber,
  "tool-input-not-strict": toolInputNotStrict,
  "trim-after-string-constraint": trimAfterStringConstraint,
  "union-of-literals-to-literal-array": unionOfLiteralsToLiteralArray,
  "zinfer-instead-of-zoutput": zinferInsteadOfZoutput,
  "zod3-string-format-method": zod3StringFormatMethod,
  "zodtype-annotation-instead-of-satisfies": zodtypeAnnotationInsteadOfSatisfies,
  "zodtype-t-generic-helper": zodtypeTGenericHelper,
} satisfies Record<PersonalRuleName, OxlintRule>;

const plugin = {
  meta: {
    name: "rayhanadev",
    version: packageJson.version,
  },
  rules,
};

export default plugin;
