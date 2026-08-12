/**
 * Detects `z.record(z.string(), z.unknown())` inside model-facing tool inputs. JSON arguments cannot
 * contain arbitrary JavaScript values. Use a concrete projection or assess recursive `z.json()`.
 *
 * Flags: `defineTool({ input: z.object({ metadata: z.record(z.string(), z.unknown()) }) })`
 *
 * Does not flag: provider metadata and other open records outside a tool input,
 * `z.record(z.string(), userSchema)`, or `z.record(z.string(), z.json())`.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  createZodImportState,
  isDirectZodCall,
  isInsideToolInput,
  zodImportVisitor,
} from "./zod-ast.ts";

const recordStringUnknown = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow Zod records that preserve no value information",
    },
    messages: {
      broadRecord:
        "Tool arguments cross a JSON boundary, so z.unknown() promises values the model cannot send. Replace it with a concrete value schema, or use z.json() after reviewing recursive-schema support.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        const ancestors = context.sourceCode.getAncestors(rawNode) as unknown as AstNode[];
        if (
          isInsideToolInput(ancestors) &&
          isDirectZodCall(node, "record", zod.roots) &&
          node.arguments?.length === 2 &&
          isDirectZodCall(node.arguments[0], "string", zod.roots) &&
          isDirectZodCall(node.arguments[1], "unknown", zod.roots)
        ) {
          context.report({ node: rawNode, messageId: "broadRecord" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default recordStringUnknown;
