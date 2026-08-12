/**
 * Detects `.shape` spreads from a local object schema that has refinements. Rebuilding the object
 * silently drops those checks even though its keys and inferred shape remain unchanged.
 *
 * Flags: `z.strictObject({ ...refinedBase.shape, extra: z.string() })`
 *
 * Does not flag: `refinedBase.extend({ extra: z.string() })` or a shape spread from an unrefined base.
 */
import { astNodes } from "./ast-nodes.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import {
  chainHasMethod,
  createZodImportState,
  isDirectZodCall,
  memberName,
  unwrapExpression,
  zodObjectConstructors,
  zodImportVisitor,
} from "./zod-ast.ts";

const refinementMethods = new Set(["check", "refine", "superRefine"]);

const shapeSpreadDropsRefinements = {
  meta: {
    type: "problem",
    docs: {
      description: "Prevent object shape spreads from dropping Zod refinements",
    },
    messages: {
      dropsRefinement:
        "Spreading `{{base}}.shape` rebuilds the object and drops its refinements. Start from `{{base}}.extend({ ... })` so the base checks remain active.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    const declarations = new Map<string, AstNode>();

    return {
      ...zodImportVisitor(zod),
      VariableDeclarator(rawNode) {
        const node = rawNode as AstNode;
        if (node.id?.type === "Identifier" && node.id.name && node.init) {
          declarations.set(node.id.name, node.init);
        }
      },
      SpreadElement(rawNode) {
        const node = rawNode as AstNode;
        const argument = unwrapExpression(node.argument);
        if (argument?.type !== "MemberExpression" || memberName(argument) !== "shape") {
          return;
        }

        const base = unwrapExpression(argument.object);
        if (base?.type !== "Identifier" || base.name === undefined) {
          return;
        }
        const declaration = declarations.get(base.name);
        if (!declaration || !chainHasMethod(declaration, refinementMethods)) {
          return;
        }

        const ancestors = astNodes(context.sourceCode.getAncestors(rawNode));
        const objectIndex = ancestors.findLastIndex(
          (ancestor) => ancestor.type === "ObjectExpression",
        );
        const constructor = ancestors[objectIndex - 1];
        if (
          constructor?.type === "CallExpression" &&
          [...zodObjectConstructors].some((name) => isDirectZodCall(constructor, name, zod.roots))
        ) {
          context.report({
            node: rawNode,
            messageId: "dropsRefinement",
            data: { base: base.name },
          });
        }
      },
    };
  },
} satisfies OxlintRule;

export default shapeSpreadDropsRefinements;
