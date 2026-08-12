/**
 * Requires Result.gen callbacks to return an explicit Result instead of a bare generator value.
 *
 * Flags: `Result.gen(function* () { return value; })`
 *
 * Suggests: `Result.gen(function* () { return Result.ok(value); })`
 */
import {
  betterResultImportVisitor,
  createBetterResultImportState,
  directResultCallback,
  isExplicitResultGenReturn,
  resultRootForCall,
} from "./better-result-ast.ts";
import { collectFunctionReturns } from "./function-returns.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import { unwrapExpression } from "./zod-ast.ts";

const requireResultGenReturn = {
  meta: {
    type: "problem",
    docs: {
      description: "Require explicit Result returns from Result.gen",
    },
    hasSuggestions: true,
    messages: {
      missing:
        "Result.gen(...) throws Panic when its generator does not return a Result. Return Result.ok(...) or Result.err(...).",
      replace: "Wrap this generator return with Result.ok(...).",
    },
    schema: [],
  },
  create(context) {
    const betterResult = createBetterResultImportState();
    return {
      ...betterResultImportVisitor(betterResult),
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        const callback = directResultCallback(node, "gen", betterResult);
        const root = resultRootForCall(node, betterResult);
        if (!callback || !root) {
          return;
        }

        const returns = collectFunctionReturns(callback);
        if (returns.length === 0) {
          context.report({ node: callback as never, messageId: "missing" });
          return;
        }

        const rootText = context.sourceCode.getText(root as never);
        for (const entry of returns) {
          if (isExplicitResultGenReturn(entry.value, betterResult)) {
            continue;
          }

          const value = unwrapExpression(entry.value);
          const canSuggest = value?.type !== "ConditionalExpression";
          context.report({
            node: entry.node as never,
            messageId: "missing",
            suggest: canSuggest
              ? [
                  {
                    messageId: "replace",
                    fix(fixer) {
                      if (!value) {
                        return fixer.replaceText(entry.node as never, `return ${rootText}.ok();`);
                      }
                      return fixer.replaceText(
                        value as never,
                        `${rootText}.ok(${context.sourceCode.getText(value as never)})`,
                      );
                    },
                  },
                ]
              : undefined,
          });
        }
      },
    };
  },
} satisfies OxlintRule;

export default requireResultGenReturn;
