/**
 * Detects `.optional()` before `.default()` in a schema chain. A Zod default already accepts omitted
 * or undefined input, so the optional wrapper adds no behavior.
 *
 * Flags: `z.string().optional().default("fallback")`
 *
 * Does not flag: `z.string().default("fallback")` or `z.string().optional()`.
 */
import { correctionFromEdits, removeRange } from "./corrections.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import {
  chainHasMethod,
  createZodImportState,
  isMethodCall,
  methodCallInChain,
  methodReceiver,
  zodRootIdentifier,
  zodImportVisitor,
} from "./zod-ast.ts";

const optionalMethods = new Set(["optional"]);

const optionalDefaultRedundant = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow redundant .optional() before a Zod .default()",
    },
    fixable: "code",
    messages: {
      redundant:
        ".default() already accepts omitted input, so the preceding .optional() adds no behavior. Remove that .optional() call.",
      redundantWithFix:
        ".default() already accepts omitted input, so the preceding .optional() adds no behavior. Replace the chain with `{{replacement}}`.",
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
          isMethodCall(node, "default") &&
          zodRootIdentifier(node, zod.roots) !== undefined &&
          chainHasMethod(methodReceiver(node), optionalMethods)
        ) {
          const optional = methodCallInChain(methodReceiver(node), "optional");
          const optionalReceiver = methodReceiver(optional);
          const correction = correctionFromEdits(context.sourceCode.text, node, [
            removeRange(optionalReceiver?.end, optional?.end),
          ]);

          if (correction) {
            context.report({
              node: rawNode,
              messageId: "redundantWithFix",
              data: { replacement: correction.replacement },
              fix: correction.fix,
            });
          } else {
            context.report({ node: rawNode, messageId: "redundant" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default optionalDefaultRedundant;
