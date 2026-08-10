/**
 * Detects `ctx.addIssue()` calls without a `path` inside direct Zod object refinements, because a
 * pathless cross-field error reaches callers as an unattributed top-level message and hides which
 * input they should correct.
 *
 * Flags: `z.strictObject({ a: z.string() }).superRefine((v, ctx) => ctx.addIssue({ code: "custom", message: "invalid a" }));`
 *
 * Does not flag: the same issue with `path: ["a"]`, or a pathless issue on a string refinement where
 * Zod supplies the containing field path.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  enclosingRefinementCall,
  hasProperty,
  memberName,
  methodReceiver,
  zodObjectConstructors,
  zodRootConstructor,
} from "./zod-ast.ts";

const crossFieldIssueWithoutPath = {
  meta: {
    type: "problem",
    docs: {
      description: "Require field paths on issues added by object refinements",
    },
    messages: {
      missingPath:
        "Attach a path to this cross-field issue so callers can identify the responsible field.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (memberName(node.callee) !== "addIssue") {
          return;
        }

        const [issue] = node.arguments ?? [];
        if (issue?.type !== "ObjectExpression" || hasProperty(issue, "path")) {
          return;
        }

        const ancestors = context.sourceCode.getAncestors(rawNode) as unknown as AstNode[];
        const refinement = enclosingRefinementCall(ancestors);
        const receiver = methodReceiver(refinement);
        if (zodObjectConstructors.has(zodRootConstructor(receiver) ?? "")) {
          context.report({ node: rawNode, messageId: "missingPath" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default crossFieldIssueWithoutPath;
