/**
 * Detects mechanically verifiable ASD-STE100 violations in source prose. The rule keeps comments
 * concise and predictable without changing legal text, directives, or code examples.
 *
 * @example
 * // The client can't retry this operation; preserve the response.
 *
 * The rule does not flag code in backticks, fenced examples, URLs, license text, or tool directives.
 */
import {
  asCommentSource,
  contractionIn,
  extractCommentProse,
  paragraphSentenceCounts,
  sentencesOf,
} from "../analysis/comments.ts";
import type { OxlintRule, SourceComment } from "./types.ts";

const commentSte100 = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforce the deterministic ASD-STE100 subset in source comments",
    },
    messages: {
      contraction: "Replace the contraction {{word}} with its full form.",
      longParagraph: "Split this paragraph. ASD-STE100 limits a paragraph to six sentences.",
      longSentence:
        "Shorten this sentence to 25 words or fewer. This sentence has {{words}} words.",
      semicolon: "Replace the semicolon with separate sentences or a list.",
    },
    schema: [],
  },
  create(context) {
    const sourceCode = asCommentSource(context.sourceCode);
    const report = (
      comment: SourceComment,
      messageId: string,
      data?: { word: string } | { words: string },
    ) => {
      context.report({ loc: comment.loc, messageId, data });
    };
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          const prose = extractCommentProse(comment);
          if (!prose || prose.text.length === 0) {
            continue;
          }
          const contraction = contractionIn(prose.text);
          if (contraction) {
            report(comment, "contraction", { word: contraction });
          }
          if (prose.text.includes(";")) {
            report(comment, "semicolon");
          }
          for (const sentence of sentencesOf(prose)) {
            if (sentence.words > 25) {
              report(comment, "longSentence", { words: String(sentence.words) });
            }
          }
          if (paragraphSentenceCounts(prose).some((count) => count > 6)) {
            report(comment, "longParagraph");
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default commentSte100;
