/**
 * Rejects conditional object spreads that use an empty object to omit properties.
 *
 * Flags: `const options = { ...(enabled ? { enabled } : {}) };`
 *
 * Does not flag: `const options = { enabled };` or separate conditional assignments.
 */
import { unwrapTypeScriptExpression } from "./ast-nodes.ts";
import type { AstNode, OxlintRule } from "./types.ts";

function isEmptyObject(node: AstNode | null | undefined): boolean {
  return node?.type === "ObjectExpression" && node.properties?.length === 0;
}

function isConditionalEmptyObject(node: AstNode | undefined): boolean {
  const expression = unwrapTypeScriptExpression(node);
  return (
    expression?.type === "ConditionalExpression" &&
    (isEmptyObject(expression.consequent) || isEmptyObject(expression.alternate))
  );
}

const noConditionalEmptyObjectSpread = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow conditional object spreads that use an empty object branch",
    },
    messages: {
      avoid:
        "Avoid conditional empty-object spreads. Use a direct property or explicit object construction.",
    },
    schema: [],
  },
  create(context) {
    return {
      SpreadElement(rawNode) {
        const node = rawNode as AstNode;
        if (isConditionalEmptyObject(node.argument)) {
          context.report({ node: rawNode, messageId: "avoid" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default noConditionalEmptyObjectSpread;
