/**
 * Detects likely ASD-STE100 grammar problems that need human review. It warns about passive voice,
 * complex tense, long instructions, and dense noun clusters. These forms can hide actors and impede
 * translation.
 *
 * @example
 * // The response has been processed by the worker.
 *
 * The rule does not flag short active sentences or comments that contain only code and directives.
 */
import { asCommentSource, extractCommentProse, sentencesOf } from "../analysis/comments.ts";
import type { OxlintRule, SourceComment } from "./types.ts";

const passivePattern =
  /\b(?:am|are|be|been|being|is|was|were)\s+(?:built|done|found|given|kept|known|made|read|sent|set|shown|written|[a-z]{2,}ed)\b/iu;
const perfectTensePattern = /\b(?:had|has|have)\s+(?:been\s+)?[a-z]+(?:ed|en)\b/iu;
const progressivePattern = /\b(?:am|are|is|was|were)\s+([a-z]+ing)\b/giu;
const nonVerbIngWords = new Set([
  "anything",
  "confusing",
  "everything",
  "missing",
  "nothing",
  "something",
  "string",
  "thing",
]);
const imperativeVerbs = new Set([
  "add",
  "call",
  "check",
  "choose",
  "create",
  "delete",
  "do",
  "keep",
  "move",
  "read",
  "remove",
  "replace",
  "return",
  "run",
  "set",
  "use",
  "write",
]);
const probableNounPattern = /(?:ance|ence|ion|ity|ment|ness|ure)$/u;

function firstWord(text: string): string {
  return /^\W*([\p{L}]+(?:-[\p{L}]+)*)/u.exec(text)?.[1]?.toLowerCase() ?? "";
}

function hasComplexTense(text: string): boolean {
  if (perfectTensePattern.test(text)) {
    return true;
  }
  for (const match of text.matchAll(progressivePattern)) {
    if (!nonVerbIngWords.has(match[1]!.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function hasDenseNounCluster(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z]+/gu) ?? [];
  let run = 0;
  for (const word of words) {
    run = probableNounPattern.test(word) ? run + 1 : 0;
    if (run > 3) {
      return true;
    }
  }
  return false;
}

const commentSte100Heuristics = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn about probable ASD-STE100 grammar problems in comments",
    },
    messages: {
      complexTense: "Use a simple tense unless the time relationship is necessary.",
      longInstruction: "Shorten this probable instruction to 20 words or fewer.",
      nounCluster: "Review this probable noun cluster. Use no more than three consecutive nouns.",
      passiveVoice: "Use active voice and name the actor when the actor is known.",
    },
    schema: [],
  },
  create(context) {
    const sourceCode = asCommentSource(context.sourceCode);
    const report = (comment: SourceComment, messageId: string): void => {
      context.report({ loc: comment.loc, messageId });
    };
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          const prose = extractCommentProse(comment);
          if (!prose) {
            continue;
          }
          if (passivePattern.test(prose.text)) {
            report(comment, "passiveVoice");
          }
          if (hasComplexTense(prose.text)) {
            report(comment, "complexTense");
          }
          if (hasDenseNounCluster(prose.text)) {
            report(comment, "nounCluster");
          }
          if (
            sentencesOf(prose).some(
              (sentence) => sentence.words > 20 && imperativeVerbs.has(firstWord(sentence.text)),
            )
          ) {
            report(comment, "longInstruction");
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default commentSte100Heuristics;
