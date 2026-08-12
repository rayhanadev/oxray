import packageJson from "../package.json" with { type: "json" };
import type { PersonalRuleName } from "./rule-names.ts";
import commentExplainsWhy from "./rules/comment-explains-why.ts";
import commentSte100Heuristics from "./rules/comment-ste100-heuristics.ts";
import commentSte100 from "./rules/comment-ste100.ts";
import commentedOutCodeRequiresReason from "./rules/commented-out-code-requires-reason.ts";
import complexFileHeader from "./rules/complex-file-header.ts";
import constantsFileOrganization from "./rules/constants-file-organization.ts";
import crossFieldIssueWithoutPath from "./rules/cross-field-issue-without-path.ts";
import domainKnowledgeInAgents from "./rules/domain-knowledge-in-agents.ts";
import enumFileOrganization from "./rules/enum-file-organization.ts";
import errorsFileOrganization from "./rules/errors-file-organization.ts";
import filenameMatchExport from "./rules/filename-match-export.ts";
import jsonParseArgumentOfSafeparse from "./rules/json-parse-argument-of-safeparse.ts";
import lintSuppressionRequiresReason from "./rules/lint-suppression-requires-reason.ts";
import noChainedTypeAssertions from "./rules/no-chained-type-assertions.ts";
import noConditionalEmptyObjectSpread from "./rules/no-conditional-empty-object-spread.ts";
import noExportedFunctionExpressions from "./rules/no-exported-function-expressions.ts";
import noJsonParseStringifyCodec from "./rules/no-json-parse-stringify-codec.ts";
import noKnownValueWidening from "./rules/no-known-value-widening.ts";
import noTypeErasure from "./rules/no-type-erasure.ts";
import noTypeof from "./rules/no-typeof.ts";
import noUnknownTypeAliases from "./rules/no-unknown-type-aliases.ts";
import noUnsafeDictionaryType from "./rules/no-unsafe-dictionary-type.ts";
import noWidenThenAssert from "./rules/no-widen-then-assert.ts";
import noZodTypeErasure from "./rules/no-zod-type-erasure.ts";
import numberIntMethod from "./rules/number-int-method.ts";
import objectStrictMethod from "./rules/object-strict-method.ts";
import optionalDefaultRedundant from "./rules/optional-default-redundant.ts";
import recordStringUnknown from "./rules/record-string-unknown.ts";
import requireJsdocComments from "./rules/require-jsdoc-comments.ts";
import schemasFileOrganization from "./rules/schemas-file-organization.ts";
import shapeSpreadDropsRefinements from "./rules/shape-spread-drops-refinements.ts";
import throwingZodRefine from "./rules/throwing-zod-refine.ts";
import toolInputIntegerAsNumber from "./rules/tool-input-integer-as-number.ts";
import toolInputNotStrict from "./rules/tool-input-not-strict.ts";
import trimAfterStringConstraint from "./rules/trim-after-string-constraint.ts";
import typesFileOrganization from "./rules/types-file-organization.ts";
import type { OxlintRule } from "./rules/types.ts";
import unionOfLiteralsToLiteralArray from "./rules/union-of-literals-to-literal-array.ts";
import zinferInsteadOfZoutput from "./rules/zinfer-instead-of-zoutput.ts";
import zod3StringFormatMethod from "./rules/zod3-string-format-method.ts";
import zodtypeAnnotationInsteadOfSatisfies from "./rules/zodtype-annotation-instead-of-satisfies.ts";
import zodtypeTGenericHelper from "./rules/zodtype-t-generic-helper.ts";

const rules = {
  "comment-explains-why": commentExplainsWhy,
  "comment-ste100": commentSte100,
  "comment-ste100-heuristics": commentSte100Heuristics,
  "commented-out-code-requires-reason": commentedOutCodeRequiresReason,
  "complex-file-header": complexFileHeader,
  "constants-file-organization": constantsFileOrganization,
  "cross-field-issue-without-path": crossFieldIssueWithoutPath,
  "domain-knowledge-in-agents": domainKnowledgeInAgents,
  "enum-file-organization": enumFileOrganization,
  "errors-file-organization": errorsFileOrganization,
  "filename-match-export": filenameMatchExport,
  "json-parse-argument-of-safeparse": jsonParseArgumentOfSafeparse,
  "lint-suppression-requires-reason": lintSuppressionRequiresReason,
  "no-chained-type-assertions": noChainedTypeAssertions,
  "no-conditional-empty-object-spread": noConditionalEmptyObjectSpread,
  "no-exported-function-expressions": noExportedFunctionExpressions,
  "no-json-parse-stringify-codec": noJsonParseStringifyCodec,
  "no-known-value-widening": noKnownValueWidening,
  "no-type-erasure": noTypeErasure,
  "no-typeof": noTypeof,
  "no-unknown-type-aliases": noUnknownTypeAliases,
  "no-unsafe-dictionary-type": noUnsafeDictionaryType,
  "no-widen-then-assert": noWidenThenAssert,
  "no-zod-type-erasure": noZodTypeErasure,
  "number-int-method": numberIntMethod,
  "object-strict-method": objectStrictMethod,
  "optional-default-redundant": optionalDefaultRedundant,
  "record-string-unknown": recordStringUnknown,
  "require-jsdoc-comments": requireJsdocComments,
  "schemas-file-organization": schemasFileOrganization,
  "shape-spread-drops-refinements": shapeSpreadDropsRefinements,
  "throwing-zod-refine": throwingZodRefine,
  "tool-input-integer-as-number": toolInputIntegerAsNumber,
  "tool-input-not-strict": toolInputNotStrict,
  "trim-after-string-constraint": trimAfterStringConstraint,
  "types-file-organization": typesFileOrganization,
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
