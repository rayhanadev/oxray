/**
 * Detects `.shape` spreads from a locally declared object schema carrying `.refine()`,
 * `.superRefine()`, or `.check()`, because rebuilding an object from its shape silently drops those
 * refinements even though the keys and inferred shape still look correct.
 *
 * Flags: `z.strictObject({ ...refinedBase.shape, extra: z.string() })`
 *
 * Does not flag: `refinedBase.extend({ extra: z.string() })` or a shape spread from an unrefined base.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  chainHasMethod,
  isDirectZodCall,
  memberName,
  unwrapExpression,
  zodObjectConstructors,
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
        "Spreading `.shape` drops the base schema's refinements. Keep `.extend()` for this refined schema.",
    },
    schema: [],
  },
  create(context) {
    const declarations = new Map<string, AstNode>();

    return {
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

        const ancestors = context.sourceCode.getAncestors(rawNode) as unknown as AstNode[];
        const objectIndex = ancestors.findLastIndex(
          (ancestor) => ancestor.type === "ObjectExpression",
        );
        const constructor = ancestors[objectIndex - 1];
        if (
          constructor?.type === "CallExpression" &&
          [...zodObjectConstructors].some((name) => isDirectZodCall(constructor, name))
        ) {
          context.report({ node: rawNode, messageId: "dropsRefinement" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default shapeSpreadDropsRefinements;
