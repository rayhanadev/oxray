/**
 * Detects declaration comments that repeat the symbol name without adding a contract or rationale.
 * Redundant narration becomes stale quickly and hides the constraints that maintainers need.
 *
 * @example
 * /** Returns the user. *\/
 * export function getUser() {}
 *
 * The rule does not flag documentation that explains failures, side effects, constraints, or design
 * reasons.
 */
import {
  asCommentSource,
  directlyPrecedingComment,
  extractCommentProse,
} from "../analysis/comments.ts";
import { declarationName, documentationHost } from "./comment-ast.ts";
import type { AstNode, OxlintRule, SourceComment } from "./types.ts";

const rationalePattern =
  /\b(?:because|ensures?|guarantees?|if|in order to|must|preserves?|prevents?|requires?|so that|throws?|unless|when|while)\b|@(deprecated|example|remarks|see|throws)\b/iu;
const genericWords = new Set([
  "a",
  "an",
  "class",
  "create",
  "creates",
  "function",
  "get",
  "gets",
  "return",
  "returns",
  "set",
  "sets",
  "the",
  "this",
  "update",
  "updates",
  "value",
]);

function words(value: string): string[] {
  return (
    value
      .replace(/([a-z\d])([A-Z])/gu, "$1 $2")
      .toLowerCase()
      .match(/[a-z\d]+/gu) ?? []
  );
}

function nameFor(sourceCode: ReturnType<typeof asCommentSource>, node: AstNode): string | null {
  const ownName = declarationName(node);
  if (ownName) {
    return ownName;
  }
  for (const ancestor of sourceCode.getAncestors(node).toReversed()) {
    if (ancestor.type === "VariableDeclarator" && ancestor.id?.name) {
      return ancestor.id.name;
    }
    if (ancestor.type === "MethodDefinition" && ancestor.key?.name) {
      return ancestor.key.name;
    }
  }
  return null;
}

function onlyRestatesName(comment: SourceComment, name: string): boolean {
  const prose = extractCommentProse(comment);
  if (!prose?.text || rationalePattern.test(comment.value)) {
    return false;
  }
  const nameWords = new Set(words(name));
  const content = words(prose.paragraphs[0] ?? "").filter((word) => !genericWords.has(word));
  return content.length > 0 && content.every((word) => nameWords.has(word));
}

const commentExplainsWhy = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn when declaration comments narrate a name without adding useful context",
    },
    messages: {
      restatesName:
        "Explain a constraint, side effect, failure mode, or rationale instead of restating the symbol name.",
    },
    schema: [],
  },
  create(context) {
    const sourceCode = asCommentSource(context.sourceCode);
    const checked = new Set<SourceComment>();
    const check = (node: AstNode): void => {
      const host = documentationHost(sourceCode, node);
      if (!host) {
        return;
      }
      const comment = directlyPrecedingComment(sourceCode, host);
      const name = nameFor(sourceCode, node);
      if (!comment || !name || checked.has(comment)) {
        return;
      }
      checked.add(comment);
      if (onlyRestatesName(comment, name)) {
        context.report({ loc: comment.loc, messageId: "restatesName" });
      }
    };
    return {
      ArrowFunctionExpression(node) {
        check(node as AstNode);
      },
      ClassDeclaration(node) {
        check(node as AstNode);
      },
      ClassExpression(node) {
        check(node as AstNode);
      },
      FunctionDeclaration(node) {
        check(node as AstNode);
      },
      FunctionExpression(node) {
        check(node as AstNode);
      },
      MethodDefinition(node) {
        check(node as AstNode);
      },
      TSDeclareFunction(node) {
        check(node as AstNode);
      },
    };
  },
} satisfies OxlintRule;

export default commentExplainsWhy;
