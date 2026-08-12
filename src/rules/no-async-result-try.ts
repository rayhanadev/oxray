/**
 * Prevents Result.try from storing a Promise without capturing its later rejection.
 *
 * Flags: `Result.try(async () => operation())`
 *
 * Suggests: `Result.tryPromise(async () => operation())`
 */
import {
  betterResultImportVisitor,
  createBetterResultImportState,
  isResultStaticCall,
  resultBoundaryCallback,
} from "./better-result-ast.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import { unwrapExpression } from "./zod-ast.ts";

const noAsyncResultTry = {
  meta: {
    type: "problem",
    docs: {
      description: "Use Result.tryPromise for async callbacks",
    },
    hasSuggestions: true,
    messages: {
      forbidden: "Result.try(...) does not capture Promise rejection. Use Result.tryPromise(...).",
      replace: "Replace Result.try(...) with Result.tryPromise(...).",
    },
    schema: [],
  },
  create(context) {
    const betterResult = createBetterResultImportState();
    return {
      ...betterResultImportVisitor(betterResult),
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (!isResultStaticCall(node, "try", betterResult)) {
          return;
        }
        const callback = resultBoundaryCallback(node, betterResult);
        if (!callback?.async) {
          return;
        }

        const callee = unwrapExpression(node.callee);
        const property = unwrapExpression(callee?.property);
        if (!property) {
          return;
        }
        context.report({
          node: rawNode,
          messageId: "forbidden",
          suggest: [
            {
              messageId: "replace",
              fix(fixer) {
                return fixer.replaceText(property as never, "tryPromise");
              },
            },
          ],
        });
      },
    };
  },
} satisfies OxlintRule;

export default noAsyncResultTry;
