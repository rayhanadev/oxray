/**
 * Detects runtime `typeof` expressions, because oxray projects should narrow values with
 * domain-specific guards or schemas that preserve concrete type information instead of branching
 * on primitive labels.
 *
 * Flags: `if (typeof value === "string") use(value);`
 *
 * Does not flag: `type Value = typeof value;` or `if (isUser(value)) use(value);`
 */
import type { OxlintRule } from "./types.ts";

const noTypeof = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow runtime typeof checks",
    },
    messages: {
      forbidden:
        "Avoid typeof checks. Use a domain-specific type guard that preserves concrete type information.",
    },
    schema: [],
  },
  create(context) {
    return {
      UnaryExpression(node) {
        if (node.operator === "typeof") {
          context.report({ node, messageId: "forbidden" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default noTypeof;
