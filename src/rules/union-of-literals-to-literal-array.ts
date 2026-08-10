/**
 * Detects Zod unions made only from same-type primitive literals. Zod 4's literal-array form accepts
 * the same values and produces a flatter enum schema with simpler issues.
 *
 * Flags: `z.union([z.literal(1), z.literal(2)])`
 *
 * Does not flag: `z.literal([1, 2])` or `z.union([z.literal(1), z.literal("two")])`.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  createZodImportState,
  isDirectZodCall,
  isPrimitiveLiteral,
  primitiveLiteralKind,
  unwrapExpression,
  zodImportVisitor,
} from "./zod-ast.ts";

function literalValue(
  node: AstNode | null | undefined,
  roots: ReadonlySet<string>,
): AstNode | undefined {
  const current = unwrapExpression(node);
  if (!isDirectZodCall(current, "literal", roots) || current?.arguments?.length !== 1) {
    return undefined;
  }
  const [value] = current.arguments;
  return isPrimitiveLiteral(value) ? unwrapExpression(value) : undefined;
}

const unionOfLiteralsToLiteralArray = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer Zod 4 literal arrays over unions of primitive literals",
    },
    messages: {
      flatten: "Use z.literal([values...]) instead of a union of same-type literals.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (!isDirectZodCall(node, "union", zod.roots) || node.arguments?.length !== 1) {
          return;
        }

        const [argument] = node.arguments;
        const array = unwrapExpression(argument);
        if (array?.type !== "ArrayExpression" || (array.elements?.length ?? 0) < 2) {
          return;
        }

        const values = (array.elements ?? []).map((element) => literalValue(element, zod.roots));
        if (values.some((value) => value === undefined)) {
          return;
        }
        const kinds = new Set(values.map((value) => primitiveLiteralKind(value!)));
        if (kinds.size === 1) {
          context.report({ node: rawNode, messageId: "flatten" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default unionOfLiteralsToLiteralArray;
