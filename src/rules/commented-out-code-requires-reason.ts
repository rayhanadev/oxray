/**
 * Detects high-confidence implementation code inside ordinary comments. Delete stale disabled code,
 * move it to a JSDoc example, or add an adjacent `KEPT:` rationale.
 *
 * @example
 * // const response = await legacyClient.send(request);
 *
 * The rule does not flag prose, fenced JSDoc examples, or code preceded by a five-word `KEPT:`
 * rationale.
 */
import {
  asCommentSource,
  countSteWords,
  isCodeLikeCommentText,
  isDirectiveOrLegalComment,
  isJSDocComment,
} from "../analysis/comments.ts";
import type { OxlintRule, SourceComment } from "./types.ts";

function keptReason(comment: SourceComment | undefined): string | null {
  if (!comment) {
    return null;
  }
  return /^\s*KEPT:\s*(.+)$/iu.exec(comment.value.trim())?.[1] ?? null;
}

const commentedOutCodeRequiresReason = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require deletion, documentation, or a rationale for commented-out code",
    },
    messages: {
      code: "Delete this code, move it to a JSDoc example, or add `KEPT: <reason>` above it.",
      shortReason: "Explain `KEPT:` with at least five words.",
    },
    schema: [],
  },
  create(context) {
    const sourceCode = asCommentSource(context.sourceCode);
    return {
      Program() {
        const comments = sourceCode.getAllComments();
        for (const [index, comment] of comments.entries()) {
          if (isJSDocComment(comment) || isDirectiveOrLegalComment(comment)) {
            continue;
          }
          const ownReason = keptReason(comment);
          if (ownReason) {
            if (countSteWords(ownReason) < 5) {
              context.report({ loc: comment.loc, messageId: "shortReason" });
            }
            continue;
          }
          if (!isCodeLikeCommentText(comment.value)) {
            continue;
          }
          const previous = comments[index - 1];
          const reason =
            previous && previous.loc.end.line >= comment.loc.start.line - 1
              ? keptReason(previous)
              : null;
          if (!reason) {
            context.report({ loc: comment.loc, messageId: "code" });
          } else if (countSteWords(reason) < 5) {
            context.report({ loc: previous!.loc, messageId: "shortReason" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default commentedOutCodeRequiresReason;
