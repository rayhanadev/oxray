/**
 * Disallows catch handlers because exception boundaries must use Result.try or Result.tryPromise.
 *
 * Flags: `try { read(); } catch (cause) { recover(cause); }`
 *
 * Does not flag: `try { use(resource); } finally { resource.close(); }`
 */
import type { AstNode, OxlintRule } from "./types.ts";

const noTryCatch = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow try/catch application control flow",
    },
    messages: {
      forbidden:
        "Do not use try/catch. Capture exceptions with Result.try(...) or Result.tryPromise(...).",
    },
    schema: [],
  },
  create(context) {
    return {
      TryStatement(rawNode) {
        const node = rawNode as AstNode;
        if (node.handler) {
          context.report({ node: rawNode, messageId: "forbidden" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default noTryCatch;
