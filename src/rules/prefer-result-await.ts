/**
 * Requires Result.await when an asynchronous Result.gen callback yields a Promise of Result.
 *
 * Flags: `yield* await loadUser()`
 *
 * Suggests: `yield* Result.await(loadUser())`
 */
import { astNodes } from "./ast-nodes.ts";
import {
  betterResultImportVisitor,
  createBetterResultImportState,
  enclosingResultGenCall,
  resultRootForCall,
} from "./better-result-ast.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import { unwrapExpression } from "./zod-ast.ts";

const preferResultAwait = {
  meta: {
    type: "problem",
    docs: {
      description: "Use Result.await in asynchronous Result.gen workflows",
    },
    hasSuggestions: true,
    messages: {
      forbidden: "Do not await a Result before yielding it. Use yield* Result.await(promise).",
      replace: "Replace the awaited expression with Result.await(...).",
    },
    schema: [],
  },
  create(context) {
    const betterResult = createBetterResultImportState();
    return {
      ...betterResultImportVisitor(betterResult),
      YieldExpression(rawNode) {
        const node = rawNode as AstNode;
        const awaited = unwrapExpression(node.argument);
        if (!node.delegate || awaited?.type !== "AwaitExpression") {
          return;
        }

        const ancestors = astNodes(context.sourceCode.getAncestors(rawNode));
        const genCall = enclosingResultGenCall(ancestors, betterResult);
        const root = resultRootForCall(genCall, betterResult);
        const promise = unwrapExpression(awaited.argument);
        if (!genCall || !root || !promise) {
          return;
        }

        const rootText = context.sourceCode.getText(root as never);
        const promiseText = context.sourceCode.getText(promise as never);
        context.report({
          node: rawNode,
          messageId: "forbidden",
          suggest: [
            {
              messageId: "replace",
              fix(fixer) {
                return fixer.replaceText(awaited as never, `${rootText}.await(${promiseText})`);
              },
            },
          ],
        });
      },
    };
  },
} satisfies OxlintRule;

export default preferResultAwait;
