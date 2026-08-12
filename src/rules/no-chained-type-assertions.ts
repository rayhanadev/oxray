/**
 * Rejects nested TypeScript assertions that manufacture type evidence in multiple steps.
 *
 * Flags: `const user = input as unknown as User;`
 *
 * Does not flag: `const user = input as User;` or `const value = { id: 1 } as const;`
 */
import { isAstNode } from "./ast-nodes.ts";
import type { AstNode, OxlintRule } from "./types.ts";

function unwrapParentheses(node: AstNode | undefined): AstNode | undefined {
  let current = node;
  while (current?.type === "ParenthesizedExpression" && isAstNode(current.expression)) {
    current = current.expression;
  }
  return current;
}

function isTypeAssertion(node: AstNode | undefined): boolean {
  return node?.type === "TSAsExpression" || node?.type === "TSTypeAssertion";
}

function isChainedAssertion(node: AstNode): boolean {
  return isTypeAssertion(
    unwrapParentheses(isAstNode(node.expression) ? node.expression : undefined),
  );
}

const noChainedTypeAssertions = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow chained TypeScript type assertions",
    },
    messages: {
      chained:
        "Chained assertions fabricate type evidence. Preserve the precise type, or parse external input at its boundary.",
    },
    schema: [],
  },
  create(context) {
    return {
      TSAsExpression(rawNode) {
        if (isChainedAssertion(rawNode as AstNode)) {
          context.report({ node: rawNode, messageId: "chained" });
        }
      },
      TSTypeAssertion(rawNode) {
        if (isChainedAssertion(rawNode as AstNode)) {
          context.report({ node: rawNode, messageId: "chained" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default noChainedTypeAssertions;
