/**
 * Detects field-targeted `ctx.addIssue()` calls without a `path` in direct object refinements. An
 * unattributed error hides the fields that the caller must correct. Broad invariants stay
 * top-level.
 *
 * Flags: `z.strictObject({ a: z.string() }).superRefine((v, ctx) => { if (v.a === "") ctx.addIssue({ code: "custom", message: "invalid a" }); });`
 *
 * Does not flag: the same issue with `path: ["a"]` or a pathless string issue. It also permits broad
 * whole-object invariants such as “at least one of a, b, or c.”
 */
import { correctionFromEdits, type TextEdit } from "./corrections.ts";
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

function conditionFields(ancestors: readonly AstNode[], refinement: AstNode): string[] | undefined {
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
  return [...fields];
}

const crossFieldIssueWithoutPath = {
  meta: {
    type: "problem",
    docs: {
      description: "Require field paths on issues added by object refinements",
    },
    hasSuggestions: true,
    messages: {
      missingPath:
        'This issue depends on specific object fields but reports at the object root. Add `path: ["field"]` to the issue so callers can identify the field to correct.',
      missingPathWithSuggestion:
        "This issue depends on `{{field}}` but reports at the object root. Replace the issue with `{{replacement}}` so callers can identify the field to correct.",
      useFieldPath: "Add path: [{{field}}] to this issue.",
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
        const fields = refinement ? conditionFields(ancestors, refinement) : undefined;
        if (
          fields !== undefined &&
          fields.length > 0 &&
          fields.length <= 2 &&
          zodObjectConstructors.has(zodRootConstructor(receiver, zod.roots) ?? "")
        ) {
          const [field] = fields;
          const insertion: TextEdit | undefined =
            fields.length === 1 && issue.start !== undefined
              ? {
                  range: [issue.start + 1, issue.start + 1],
                  text: ` path: [${JSON.stringify(field)}],`,
                }
              : undefined;
          const correction = correctionFromEdits(context.sourceCode.text, issue, [insertion]);
          if (field !== undefined && correction) {
            context.report({
              node: rawNode,
              messageId: "missingPathWithSuggestion",
              data: { field, replacement: correction.replacement },
              suggest: [
                {
                  messageId: "useFieldPath",
                  data: { field: JSON.stringify(field) },
                  fix: correction.fix,
                },
              ],
            });
          } else {
            context.report({ node: rawNode, messageId: "missingPath" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default crossFieldIssueWithoutPath;
