/**
 * Detects `.trim()` after `.min()`, `.max()`, or `.length()` on a Zod string chain, because the
 * constraint then validates the untrimmed input and can accept whitespace that is later removed or
 * reject a value whose trimmed form is valid.
 *
 * Flags: `z.string().min(1).trim()`
 *
 * Does not flag: `z.string().trim().min(1)` or `z.string().min(1)`.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import { chainHasMethod, isMethodCall, methodReceiver, zodRootConstructor } from "./zod-ast.ts";

const lengthConstraints = new Set(["length", "max", "min"]);

const trimAfterStringConstraint = {
  meta: {
    type: "problem",
    docs: {
      description: "Require Zod string trimming before length validation",
    },
    messages: {
      wrongOrder:
        "Call .trim() before .min(), .max(), or .length(); constraints before trim validate the untrimmed value.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (
          isMethodCall(node, "trim") &&
          zodRootConstructor(node) === "string" &&
          chainHasMethod(methodReceiver(node), lengthConstraints)
        ) {
          context.report({ node: rawNode, messageId: "wrongOrder" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default trimAfterStringConstraint;
