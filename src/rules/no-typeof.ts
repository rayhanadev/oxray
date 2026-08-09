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
