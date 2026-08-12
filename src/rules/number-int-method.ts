/**
 * Detects Zod 4 chains rooted at `z.number()` that later call `.int()`, because `z.int()` is the
 * canonical, runtime-equivalent constructor and avoids building an unnecessary intermediate
 * number schema.
 *
 * Flags: `z.number().int()` and `z.number().positive().int()`
 *
 * Does not flag: `z.int().positive()` or `z.coerce.number().int()` (Zod has no coercing `z.int()`).
 */
import { correctionFromEdits, removeRange, replaceNode } from "./corrections.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import {
  createZodImportState,
  isMethodCall,
  methodReceiver,
  unwrapExpression,
  zodRootCall,
  zodRootConstructor,
  zodImportVisitor,
} from "./zod-ast.ts";

const numberIntMethod = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer z.int() over z.number().int() in Zod 4",
    },
    fixable: "code",
    messages: {
      preferInt:
        "This chain builds a broad number schema before adding an integer constraint. Start with z.int() and retain the other number checks.",
      preferIntWithFix:
        "This chain builds a broad number schema before adding an integer constraint. Replace it with `{{replacement}}`; this preserves validation and emits an integer JSON Schema.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (isMethodCall(node, "int") && zodRootConstructor(node, zod.roots) === "number") {
          const receiver = methodReceiver(node);
          const root = zodRootCall(node, zod.roots);
          const rootCallee = unwrapExpression(root?.callee);
          const correction =
            (node.arguments?.length ?? 0) === 0
              ? correctionFromEdits(context.sourceCode.text, node, [
                  replaceNode(rootCallee?.property, "int"),
                  removeRange(receiver?.end, node.end),
                ])
              : undefined;

          if (correction) {
            context.report({
              node: rawNode,
              messageId: "preferIntWithFix",
              data: { replacement: correction.replacement },
              fix: correction.fix,
            });
          } else {
            context.report({ node: rawNode, messageId: "preferInt" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default numberIntMethod;
