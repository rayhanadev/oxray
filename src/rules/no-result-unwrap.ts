/**
 * Disallows extraction that converts an expected Err into Panic.
 *
 * Flags: `Result.try(read).unwrap()` and `Result.unwrap(result)`
 */
import {
  betterResultImportVisitor,
  createBetterResultImportState,
  isKnownResultExpression,
  isResultStaticCall,
} from "./better-result-ast.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import { isMethodCall, methodReceiver } from "./zod-ast.ts";

const noResultUnwrap = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow Result unwrap assertions",
    },
    messages: {
      forbidden:
        "Do not unwrap a Result. Handle it with match(...), or propagate it with Result.gen(...) or andThen(...).",
    },
    schema: [],
  },
  create(context) {
    const betterResult = createBetterResultImportState();
    return {
      ...betterResultImportVisitor(betterResult),
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (
          isResultStaticCall(node, "unwrap", betterResult) ||
          (isMethodCall(node, "unwrap") &&
            isKnownResultExpression(methodReceiver(node), betterResult))
        ) {
          context.report({ node: rawNode, messageId: "forbidden" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default noResultUnwrap;
