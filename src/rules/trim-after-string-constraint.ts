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
import { correctionFromEdits, removeRange, type TextEdit } from "./corrections.ts";
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

function minOneCall(node: AstNode | null | undefined): AstNode | undefined {
  const current = unwrapExpression(node);
  if (current?.type !== "CallExpression") {
    return undefined;
  }
  const firstArgument = unwrapExpression(current.arguments?.[0]);
  if (
    memberName(current.callee) === "min" &&
    firstArgument?.type === "Literal" &&
    firstArgument.value === 1
  ) {
    return current;
  }
  return minOneCall(methodReceiver(current));
}

const trimAfterStringConstraint = {
  meta: {
    type: "problem",
    docs: {
      description: "Require Zod string trimming before length validation",
    },
    hasSuggestions: true,
    messages: {
      wrongOrder:
        "Call .trim() before .min(1); otherwise whitespace passes the non-empty check and is then removed.",
      wrongOrderWithSuggestion:
        "Whitespace passes .min(1) before .trim() removes it. Replace the chain with `{{replacement}}` so validation checks the normalized string.",
      trimFirst: "Move .trim() before .min(1): {{replacement}}.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        const receiver = methodReceiver(node);
        const minOne = minOneCall(receiver);
        if (
          isMethodCall(node, "trim") &&
          zodRootConstructor(node, zod.roots) === "string" &&
          minOne
        ) {
          const minReceiver = methodReceiver(minOne);
          const insertion: TextEdit | undefined =
            minReceiver?.end === undefined
              ? undefined
              : { range: [minReceiver.end, minReceiver.end], text: ".trim()" };
          const correction = correctionFromEdits(context.sourceCode.text, node, [
            insertion,
            removeRange(receiver?.end, node.end),
          ]);
          if (correction) {
            context.report({
              node: rawNode,
              messageId: "wrongOrderWithSuggestion",
              data: { replacement: correction.replacement },
              suggest: [
                {
                  messageId: "trimFirst",
                  data: { replacement: correction.replacement },
                  fix: correction.fix,
                },
              ],
            });
          } else {
            context.report({ node: rawNode, messageId: "wrongOrder" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default trimAfterStringConstraint;
