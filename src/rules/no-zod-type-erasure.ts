/**
 * @fileoverview Preserves runtime shape information in Zod schemas.
 *
 * Broad schemas accept values without preserving useful domain information. Empty permissive
 * object schemas also discard or generalize every property.
 *
 * Flags: `z.any()`, `z.unknown()`, `z.object({})`, `z.looseObject({})`, and `z.custom<T>()`.
 *
 * Does not flag: `z.json()`, exact `z.strictObject({})`, or `z.custom<T>(predicate)`.
 */
import { astNodes } from "./ast-nodes.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import {
  createZodImportState,
  isDirectZodCall,
  isInsideToolInput,
  unwrapExpression,
  zodImportVisitor,
} from "./zod-ast.ts";

const erasingObjectConstructors = ["looseObject", "object"] as const;

function hasEmptyObjectShape(node: AstNode): boolean {
  const [shape] = node.arguments ?? [];
  const current = unwrapExpression(shape);
  return (
    shape === undefined ||
    (current?.type === "ObjectExpression" && (current.properties ?? []).length === 0)
  );
}

function hasNoCustomPredicate(node: AstNode): boolean {
  const predicate = unwrapExpression(node.arguments?.[0]);
  return (
    predicate === undefined ||
    (predicate.type === "Identifier" && predicate.name === "undefined") ||
    (predicate.type === "Literal" && predicate.value === null)
  );
}

function isSpecializedToolRecordValue(
  node: AstNode,
  ancestors: readonly AstNode[],
  roots: ReadonlySet<string>,
): boolean {
  const parent = ancestors.at(-1);
  return (
    parent?.type === "CallExpression" &&
    isDirectZodCall(parent, "record", roots) &&
    parent.arguments?.length === 2 &&
    parent.arguments[1] === node &&
    isDirectZodCall(parent.arguments[0], "string", roots) &&
    isInsideToolInput(ancestors)
  );
}

const noZodTypeErasure = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow Zod schemas that erase runtime shape information",
    },
    messages: {
      broad:
        "Avoid z.any() and z.unknown(). Use a schema that validates and preserves the expected runtime shape.",
      emptyObject:
        "An empty permissive object schema preserves no concrete properties. Specify the expected object shape.",
      uncheckedCustom:
        "z.custom() without a predicate performs no runtime validation. Supply a predicate or use a concrete schema.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (
          isDirectZodCall(node, "unknown", zod.roots) &&
          isSpecializedToolRecordValue(
            node,
            astNodes(context.sourceCode.getAncestors(rawNode)),
            zod.roots,
          )
        ) {
          return;
        }

        if (
          isDirectZodCall(node, "any", zod.roots) ||
          isDirectZodCall(node, "unknown", zod.roots)
        ) {
          context.report({ node: rawNode, messageId: "broad" });
          return;
        }

        if (
          erasingObjectConstructors.some((name) => isDirectZodCall(node, name, zod.roots)) &&
          hasEmptyObjectShape(node)
        ) {
          context.report({ node: rawNode, messageId: "emptyObject" });
          return;
        }

        if (isDirectZodCall(node, "custom", zod.roots) && hasNoCustomPredicate(node)) {
          context.report({ node: rawNode, messageId: "uncheckedCustom" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default noZodTypeErasure;
