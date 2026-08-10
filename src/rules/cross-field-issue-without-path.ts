/**
 * Detects field-targeted `ctx.addIssue()` calls without a `path` inside direct Zod object
 * refinements, because an unattributed error hides which one or two fields the condition asks the
 * caller to correct. Broad whole-object invariants spanning three or more fields stay top-level.
 *
 * Flags: `z.strictObject({ a: z.string() }).superRefine((v, ctx) => { if (v.a === "") ctx.addIssue({ code: "custom", message: "invalid a" }); });`
 *
 * Does not flag: the same issue with `path: ["a"]`, a pathless issue on a string refinement where
 * Zod supplies the containing field path, or “at least one of a, b, or c” whole-object invariants.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  astSubtreeSome,
  createZodImportState,
  enclosingRefinementCall,
  hasProperty,
  isFunctionNode,
  memberName,
  methodReceiver,
  propertyName,
  unwrapExpression,
  zodObjectConstructors,
  zodRootConstructor,
  zodImportVisitor,
} from "./zod-ast.ts";

function conditionFieldCount(
  ancestors: readonly AstNode[],
  refinement: AstNode,
): number | undefined {
  const refinementIndex = ancestors.indexOf(refinement);
  const callbackIndex = ancestors.findIndex(
    (ancestor, index) => index > refinementIndex && isFunctionNode(ancestor),
  );
  if (callbackIndex < 0) {
    return undefined;
  }
  const callback = ancestors[callbackIndex];
  const parameter = unwrapExpression(callback?.params?.[0]);
  if (parameter?.type !== "Identifier" || parameter.name === undefined) {
    return undefined;
  }

  const condition = ancestors
    .slice(callbackIndex + 1)
    .findLast((ancestor) => ancestor.type === "IfStatement")?.test;
  if (!condition) {
    return undefined;
  }

  const fields = new Set<string>();
  astSubtreeSome(condition, (candidate) => {
    if (candidate.type !== "MemberExpression") {
      return false;
    }
    const object = unwrapExpression(candidate.object);
    const field = propertyName(candidate.property);
    if (object?.type === "Identifier" && object.name === parameter.name && field) {
      fields.add(field);
    }
    return false;
  });
  return fields.size;
}

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
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
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
        const fieldCount = refinement ? conditionFieldCount(ancestors, refinement) : undefined;
        if (
          fieldCount !== undefined &&
          fieldCount > 0 &&
          fieldCount <= 2 &&
          zodObjectConstructors.has(zodRootConstructor(receiver, zod.roots) ?? "")
        ) {
          context.report({ node: rawNode, messageId: "missingPath" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default crossFieldIssueWithoutPath;
