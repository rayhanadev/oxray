/**
 * Detects `.optional()` earlier in a schema chain that ends in `.default()`, because a Zod default
 * already accepts omitted or undefined input and the optional wrapper adds no behavior.
 *
 * Flags: `z.string().optional().default("fallback")`
 *
 * Does not flag: `z.string().default("fallback")` or `z.string().optional()`.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import { chainHasMethod, isMethodCall, methodReceiver } from "./zod-ast.ts";

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
    return {
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (
          isMethodCall(node, "default") &&
          chainHasMethod(methodReceiver(node), optionalMethods)
        ) {
          context.report({ node: rawNode, messageId: "redundant" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default optionalDefaultRedundant;
