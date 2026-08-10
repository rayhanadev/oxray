/**
 * Detects Zod 4 chains rooted at `z.number()` that later call `.int()`, because `z.int()` is the
 * canonical, runtime-equivalent constructor and avoids building an unnecessary intermediate
 * number schema.
 *
 * Flags: `z.number().int()` and `z.number().positive().int()`
 *
 * Does not flag: `z.int().positive()` or `z.coerce.number().int()` (Zod has no coercing `z.int()`).
 */
import type { AstNode, OxlintRule } from "./types.ts";
import { isMethodCall, zodRootConstructor } from "./zod-ast.ts";

const numberIntMethod = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer z.int() over z.number().int() in Zod 4",
    },
    messages: {
      preferInt: "Use z.int() instead of z.number().int().",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (isMethodCall(node, "int") && zodRootConstructor(node) === "number") {
          context.report({ node: rawNode, messageId: "preferInt" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default numberIntMethod;
