/**
 * Disallows nullable failure sentinels when the same function also returns a success value.
 *
 * Flags: `if (!found) return null; return user;`
 *
 * Does not flag: Boolean predicates or functions whose only explicit result is a sentinel.
 */
import { collectFunctionReturns, expandReturnBranches } from "./function-returns.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import { unwrapExpression } from "./zod-ast.ts";

function isSentinel(node: AstNode | null | undefined): boolean {
  const current = unwrapExpression(node);
  return (
    current === undefined ||
    (current.type === "Literal" && current.value === null) ||
    (current.type === "Identifier" && current.name === "undefined") ||
    (current.type === "UnaryExpression" && current.operator === "void")
  );
}

const noErrorSentinel = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow nullable failure sentinels",
    },
    messages: {
      forbidden:
        "Do not return a failure sentinel beside success values. Return Result.ok(...) or Result.err(...).",
    },
    schema: [],
  },
  create(context) {
    function inspectFunction(rawNode: unknown): void {
      const node = rawNode as AstNode;
      const branches = collectFunctionReturns(node).flatMap(expandReturnBranches);
      const sentinels = branches.filter((branch) => isSentinel(branch.value));
      if (sentinels.length === 0 || !branches.some((branch) => !isSentinel(branch.value))) {
        return;
      }
      for (const sentinel of sentinels) {
        context.report({ node: sentinel.node as never, messageId: "forbidden" });
      }
    }

    return {
      ArrowFunctionExpression: inspectFunction,
      FunctionDeclaration: inspectFunction,
      FunctionExpression: inspectFunction,
    };
  },
} satisfies OxlintRule;

export default noErrorSentinel;
