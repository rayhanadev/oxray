/**
 * Detects Zod object schemas that call the legacy `.strict()` method, because `z.strictObject()`
 * expresses the same runtime behavior and JSON Schema output directly in Zod 4.
 *
 * Flags: `z.object({ id: z.string() }).strict()`
 *
 * Does not flag: `z.strictObject({ id: z.string() })` or `z.looseObject({ id: z.string() })`.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import { isMethodCall, zodRootConstructor } from "./zod-ast.ts";

const objectStrictMethod = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer z.strictObject() over z.object().strict() in Zod 4",
    },
    messages: {
      preferStrictObject: "Use z.strictObject(shape) instead of z.object(shape).strict().",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (isMethodCall(node, "strict") && zodRootConstructor(node) === "object") {
          context.report({ node: rawNode, messageId: "preferStrictObject" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default objectStrictMethod;
