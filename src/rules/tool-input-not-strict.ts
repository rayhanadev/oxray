/**
 * Detects a top-level tool input rooted at `z.object()`. Strict tool schemas reject hallucinated
 * keys and emit `additionalProperties: false` for providers that require closed parameter objects.
 *
 * Flags: `defineTool({ input: z.object({ query: z.string() }) })`
 *
 * Does not flag: `defineTool({ input: z.strictObject({ query: z.string() }) })`, nested plain objects,
 * or response projections outside a tool definition.
 */
import { astNodes } from "./ast-nodes.ts";
import { correctionFromEdits, replaceNode } from "./corrections.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import {
  createZodImportState,
  isToolInputProperty,
  unwrapExpression,
  zodRootCall,
  zodRootConstructor,
  zodImportVisitor,
} from "./zod-ast.ts";

const toolInputNotStrict = {
  meta: {
    type: "problem",
    docs: {
      description: "Require strict top-level Zod objects for tool inputs",
    },
    hasSuggestions: true,
    messages: {
      strict:
        "Tool inputs must use z.strictObject() so unknown model arguments are rejected and JSON Schema emits additionalProperties: false.",
      strictWithSuggestion:
        "This tool input accepts unknown model arguments. Replace it with `{{replacement}}` to reject unknown keys and emit additionalProperties: false.",
      useStrictObject: "Replace this tool input with {{replacement}}.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      Property(rawNode) {
        const node = rawNode as AstNode;
        const ancestors = astNodes(context.sourceCode.getAncestors(rawNode));
        if (
          isToolInputProperty(node, ancestors) &&
          zodRootConstructor(node.value as AstNode, zod.roots) === "object"
        ) {
          const value = node.value as AstNode;
          const root = zodRootCall(value, zod.roots);
          const callee = unwrapExpression(root?.callee);
          const correction = correctionFromEdits(context.sourceCode.text, value, [
            replaceNode(callee?.property, "strictObject"),
          ]);
          if (correction) {
            context.report({
              node: rawNode,
              messageId: "strictWithSuggestion",
              data: { replacement: correction.replacement },
              suggest: [
                {
                  messageId: "useStrictObject",
                  data: { replacement: correction.replacement },
                  fix: correction.fix,
                },
              ],
            });
          } else {
            context.report({ node: rawNode, messageId: "strict" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default toolInputNotStrict;
