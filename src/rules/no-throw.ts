/**
 * Disallows direct throws because expected failures use Result and defects use `panic()`.
 *
 * Flags: `throw new UserNotFound({ id })`
 */
import type { OxlintRule } from "./types.ts";

const noThrow = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct throws in Result-based code",
    },
    messages: {
      forbidden:
        "Do not throw. Return Result.err(...) for an expected failure, or use panic(...) for a defect.",
    },
    schema: [],
  },
  create(context) {
    return {
      ThrowStatement(node) {
        context.report({ node, messageId: "forbidden" });
      },
    };
  },
} satisfies OxlintRule;

export default noThrow;
