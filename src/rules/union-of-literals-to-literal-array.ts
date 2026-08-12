/**
 * Detects Zod unions made only from same-type primitive literals. Zod 4's literal-array form accepts
 * the same values and produces a flatter enum schema with simpler issues.
 *
 * Flags: `z.union([z.literal(1), z.literal(2)])`
 *
 * Does not flag: `z.literal([1, 2])` or `z.union([z.literal(1), z.literal("two")])`.
 */
import { correctionFromEdits, removeRange, replaceNode, type TextEdit } from "./corrections.ts";
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
    fixable: "code",
    messages: {
      flatten:
        "A union of same-type primitive literals creates unnecessary union branches. Use z.literal([values...]) to produce one enum schema.",
      flattenWithFix:
        "A union of same-type primitive literals creates unnecessary union branches. Replace it with `{{replacement}}` to produce one enum schema.",
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
          const callee = unwrapExpression(node.callee);
          const edits: Array<TextEdit | undefined> = [replaceNode(callee?.property, "literal")];
          for (const [index, value] of values.entries()) {
            const literal = unwrapExpression(array.elements?.[index]);
            edits.push(
              removeRange(literal?.start, value?.start),
              removeRange(value?.end, literal?.end),
            );
          }
          const correction = correctionFromEdits(context.sourceCode.text, node, edits);

          if (correction) {
            context.report({
              node: rawNode,
              messageId: "flattenWithFix",
              data: { replacement: correction.replacement },
              fix: correction.fix,
            });
          } else {
            context.report({ node: rawNode, messageId: "flatten" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default unionOfLiteralsToLiteralArray;
