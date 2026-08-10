/**
 * Detects `.optional()` before `.default()` in a schema chain. A Zod default already accepts omitted
 * or undefined input, so the optional wrapper adds no behavior.
 *
 * Flags: `z.string().optional().default("fallback")`
 *
 * Does not flag: `z.string().default("fallback")` or `z.string().optional()`.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  chainHasMethod,
  createZodImportState,
  isMethodCall,
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
    messages: {
      redundant: ".default() already accepts omitted input; remove the preceding .optional().",
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
          context.report({ node: rawNode, messageId: "redundant" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default optionalDefaultRedundant;
