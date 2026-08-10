/**
 * Detects a top-level tool input rooted at `z.object()`. Strict tool schemas reject hallucinated
 * keys and emit `additionalProperties: false` for providers that require closed parameter objects.
 *
 * Flags: `defineTool({ input: z.object({ query: z.string() }) })`
 *
 * Does not flag: `defineTool({ input: z.strictObject({ query: z.string() }) })`, nested plain objects,
 * or response projections outside a tool definition.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  createZodImportState,
  isToolInputProperty,
  zodRootConstructor,
  zodImportVisitor,
} from "./zod-ast.ts";

const toolInputNotStrict = {
  meta: {
    type: "problem",
    docs: {
      description: "Require strict top-level Zod objects for tool inputs",
    },
    messages: {
      strict:
        "Tool inputs must use z.strictObject() so unknown model arguments are rejected and JSON Schema emits additionalProperties: false.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      Property(rawNode) {
        const node = rawNode as AstNode;
        const ancestors = context.sourceCode.getAncestors(rawNode) as unknown as AstNode[];
        if (
          isToolInputProperty(node, ancestors) &&
          zodRootConstructor(node.value as AstNode, zod.roots) === "object"
        ) {
          context.report({ node: rawNode, messageId: "strict" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default toolInputNotStrict;
