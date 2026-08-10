/**
 * Detects broad or unexplained lint suppression comments. A narrow directive with a rationale makes
 * the exceptional scope reviewable and lets unused-directive reporting remove it when the problem
 * disappears.
 *
 * @example
 * // oxlint-disable-next-line no-console -- The command must write its result to standard output.
 *
 * The rule does not flag rule-specific line suppressions with a rationale of at least five words.
 */
import { asCommentSource, countSteWords } from "../analysis/comments.ts";
import type { OxlintRule } from "./types.ts";

const suppressionPattern =
  /^(?:\/\*+|\/\/)?\s*(?:eslint|oxlint)-disable(?:(-next-line|-line))?\b([\s\S]*?)(?:\*\/)?\s*$/iu;
const ruleListPattern = /^[\w@/-]+(?:\s*,\s*[\w@/-]+)*$/u;

const lintSuppressionRequiresReason = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require narrow lint suppressions with an STE rationale",
    },
    messages: {
      broad: "Use only a rule-specific disable-line or disable-next-line directive.",
      missingReason: "Add ` -- ` and a rationale of at least five words.",
      missingRules: "Name each suppressed rule explicitly.",
    },
    schema: [],
  },
  create(context) {
    const sourceCode = asCommentSource(context.sourceCode);
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          const match = suppressionPattern.exec(comment.value.trim());
          if (!match) {
            continue;
          }
          if (!match[1]) {
            context.report({ loc: comment.loc, messageId: "broad" });
            continue;
          }
          const [rules = "", reason] = (match[2] ?? "").split(/\s--\s/u, 2);
          if (!ruleListPattern.test(rules.trim())) {
            context.report({ loc: comment.loc, messageId: "missingRules" });
          }
          if (!reason || countSteWords(reason) < 5) {
            context.report({ loc: comment.loc, messageId: "missingReason" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default lintSuppressionRequiresReason;
