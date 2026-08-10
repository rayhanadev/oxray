/**
 * Detects `z.record(z.string(), z.unknown())`, because it launders a broad
 * `Record<string, unknown>` through Zod while validating no useful value shape; callers should use
 * a concrete projection or deliberately choose recursive `z.json()` at a JSON boundary.
 *
 * Flags: `z.record(z.string(), z.unknown())`
 *
 * Does not flag: `z.record(z.string(), userSchema)` or `z.record(z.string(), z.json())`.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import { isDirectZodCall } from "./zod-ast.ts";

const recordStringUnknown = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow Zod records that preserve no value information",
    },
    messages: {
      broadRecord:
        "z.record(z.string(), z.unknown()) validates no useful value shape. Use a concrete projection, or z.json() at a JSON boundary after checking its recursive-schema cost.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (
          isDirectZodCall(node, "record") &&
          node.arguments?.length === 2 &&
          isDirectZodCall(node.arguments[0], "string") &&
          isDirectZodCall(node.arguments[1], "unknown")
        ) {
          context.report({ node: rawNode, messageId: "broadRecord" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default recordStringUnknown;
