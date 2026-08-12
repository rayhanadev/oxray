/**
 * Detects runtime `typeof` expressions. Oxray projects should narrow values with specific guards or
 * schemas that preserve concrete information instead of branching on primitive labels.
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
        "A runtime typeof check only narrows the JavaScript representation; it does not establish the domain contract. Parse external input at its boundary, or use an internal union's discriminant.",
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
