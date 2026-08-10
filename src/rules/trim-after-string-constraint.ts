/**
 * Detects `.trim()` after `.min(1)` on a Zod string chain, because that common non-empty-string
 * pattern accepts whitespace and then returns an empty string. Other length constraints may
 * intentionally validate the original input before trimming, so their order is left alone.
 *
 * Flags: `z.string().min(1).trim()`
 *
 * Does not flag: `z.string().trim().min(1)`, `z.string().min(2).trim()`, or
 * `z.string().max(100).trim()`.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  createZodImportState,
  isMethodCall,
  memberName,
  methodReceiver,
  unwrapExpression,
  zodRootConstructor,
  zodImportVisitor,
} from "./zod-ast.ts";

function chainHasMinOne(node: AstNode | null | undefined): boolean {
  const current = unwrapExpression(node);
  if (current?.type !== "CallExpression") {
    return false;
  }
  const firstArgument = unwrapExpression(current.arguments?.[0]);
  if (
    memberName(current.callee) === "min" &&
    firstArgument?.type === "Literal" &&
    firstArgument.value === 1
  ) {
    return true;
  }
  return chainHasMinOne(methodReceiver(current));
}

const trimAfterStringConstraint = {
  meta: {
    type: "problem",
    docs: {
      description: "Require Zod string trimming before length validation",
    },
    messages: {
      wrongOrder:
        "Call .trim() before .min(1); otherwise whitespace passes the non-empty check and is then removed.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (
          isMethodCall(node, "trim") &&
          zodRootConstructor(node, zod.roots) === "string" &&
          chainHasMinOne(methodReceiver(node))
        ) {
          context.report({ node: rawNode, messageId: "wrongOrder" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default trimAfterStringConstraint;
