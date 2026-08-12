/**
 * Disallows rejection handlers because Promise rejection must enter Result at its operation boundary.
 *
 * Flags: `fetch(url).catch(recover)` and `fetch(url).then(use, recover)`
 */
import type { AstNode, OxlintRule } from "./types.ts";
import { isMethodCall } from "./zod-ast.ts";

const noPromiseCatch = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow Promise catch chains",
    },
    messages: {
      forbidden:
        "Do not use .catch(). Capture the rejecting operation with Result.tryPromise(...).",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (
          isMethodCall(node, "catch") ||
          (isMethodCall(node, "then") && node.arguments?.[1] !== undefined)
        ) {
          context.report({ node: rawNode, messageId: "forbidden" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default noPromiseCatch;
