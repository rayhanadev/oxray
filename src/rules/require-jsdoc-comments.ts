/**
 * Detects undocumented public functions and classes, and plain comments that describe declarations.
 * JSDoc gives tools a stable attachment point while TypeScript remains the source for parameter and
 * return types.
 *
 * @example
 * // Retries the request when the provider is unavailable.
 * export function retryRequest() {}
 *
 * The rule does not require documentation for private declarations that have no descriptive comment.
 */
import {
  asCommentSource,
  directlyPrecedingComment,
  extractCommentProse,
  isCodeLikeCommentText,
  isDirectiveOrLegalComment,
  isJSDocComment,
} from "../analysis/comments.ts";
import {
  adjacentDocumentation,
  documentationHost,
  exportedDocumentationTargets,
  isFunctionOrClass,
} from "./comment-ast.ts";
import type { AstNode, OxlintRule, SourceComment } from "./types.ts";

const semanticTagPattern = /@(deprecated|example|remarks|see|throws)\b/iu;

function usefulJSDoc(comment: SourceComment): boolean {
  const prose = extractCommentProse(comment);
  return Boolean(prose?.text || semanticTagPattern.test(comment.value));
}

const requireJsdocComments = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require JSDoc for public APIs and comments that describe declarations",
    },
    messages: {
      missingPublic: "Add JSDoc that explains this public API's rationale or contract.",
      notJsdoc: "Use JSDoc for a comment that describes a function or class.",
      uselessJsdoc:
        "Add rationale, a contract, or a semantic JSDoc tag instead of an empty documentation block.",
    },
    schema: [],
  },
  create(context) {
    const sourceCode = asCommentSource(context.sourceCode);
    const reportedComments = new Set<SourceComment>();

    const checkDescriptiveComment = (node: AstNode): void => {
      const host = documentationHost(sourceCode, node);
      if (!host) {
        return;
      }
      const comment = directlyPrecedingComment(sourceCode, host);
      if (!comment || reportedComments.has(comment)) {
        return;
      }
      if (isDirectiveOrLegalComment(comment) || isCodeLikeCommentText(comment.value)) {
        return;
      }
      if (!isJSDocComment(comment)) {
        reportedComments.add(comment);
        context.report({ loc: comment.loc, messageId: "notJsdoc" });
      } else if (!usefulJSDoc(comment)) {
        reportedComments.add(comment);
        context.report({ loc: comment.loc, messageId: "uselessJsdoc" });
      }
    };

    return {
      ArrowFunctionExpression(node) {
        checkDescriptiveComment(node as AstNode);
      },
      ClassDeclaration(node) {
        checkDescriptiveComment(node as AstNode);
      },
      ClassExpression(node) {
        checkDescriptiveComment(node as AstNode);
      },
      FunctionDeclaration(node) {
        checkDescriptiveComment(node as AstNode);
      },
      FunctionExpression(node) {
        checkDescriptiveComment(node as AstNode);
      },
      MethodDefinition(node) {
        checkDescriptiveComment(node as AstNode);
      },
      TSDeclareFunction(node) {
        checkDescriptiveComment(node as AstNode);
      },
      Program(rawNode) {
        const program = rawNode as AstNode;
        for (const target of exportedDocumentationTargets(program)) {
          if (!isFunctionOrClass(target.node)) {
            continue;
          }
          const comment = adjacentDocumentation(sourceCode, target);
          if (!comment || !isJSDocComment(comment)) {
            context.report({ loc: target.host.loc ?? program.loc!, messageId: "missingPublic" });
            continue;
          }
          reportedComments.add(comment);
          if (!usefulJSDoc(comment)) {
            context.report({ loc: comment.loc, messageId: "uselessJsdoc" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default requireJsdocComments;
