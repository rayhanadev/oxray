/**
 * Detects Zod object schemas that call the legacy `.strict()` method, because `z.strictObject()`
 * expresses the same runtime behavior and JSON Schema output directly in Zod 4.
 *
 * Flags: `z.object({ id: z.string() }).strict()`
 *
 * Does not flag: `z.strictObject({ id: z.string() })` or `z.looseObject({ id: z.string() })`.
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

const objectStrictMethod = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer z.strictObject() over z.object().strict() in Zod 4",
    },
    fixable: "code",
    messages: {
      preferStrictObject:
        "The legacy .strict() wrapper obscures the object's unknown-key policy. Start with z.strictObject(shape) and retain the following schema checks.",
      preferStrictObjectWithFix:
        "The legacy .strict() wrapper obscures the object's unknown-key policy. Replace it with `{{replacement}}`; this preserves strict parsing and JSON Schema output.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (isMethodCall(node, "strict") && zodRootConstructor(node, zod.roots) === "object") {
          const receiver = methodReceiver(node);
          const root = zodRootCall(node, zod.roots);
          const rootCallee = unwrapExpression(root?.callee);
          const correction =
            (node.arguments?.length ?? 0) === 0
              ? correctionFromEdits(context.sourceCode.text, node, [
                  replaceNode(rootCallee?.property, "strictObject"),
                  removeRange(receiver?.end, node.end),
                ])
              : undefined;

          if (correction) {
            context.report({
              node: rawNode,
              messageId: "preferStrictObjectWithFix",
              data: { replacement: correction.replacement },
              fix: correction.fix,
            });
          } else {
            context.report({ node: rawNode, messageId: "preferStrictObject" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default objectStrictMethod;
