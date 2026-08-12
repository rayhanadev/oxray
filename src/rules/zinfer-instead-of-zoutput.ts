/**
 * Detects the `z.infer` type alias. `z.output` is equivalent and explicitly names the post-parse
 * direction. That distinction remains clear when the schema gains a transform or codec.
 *
 * Flags: `type User = z.infer<typeof userSchema>;`
 *
 * Does not flag: `type User = z.output<typeof userSchema>;` or `z.input<typeof userSchema>`.
 */
import { correctionFromEdits, replaceNode } from "./corrections.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import { createZodImportState, qualifiedTypeName, zodImportVisitor } from "./zod-ast.ts";

const zinferInsteadOfZoutput = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer direction-explicit z.output over z.infer",
    },
    fixable: "code",
    messages: {
      preferOutput:
        "z.infer hides whether the type describes parsed output or accepted input. Use z.output<typeof schema> to name the parsed direction explicitly.",
      preferOutputWithFix:
        "z.infer hides whether the type describes parsed output or accepted input. Replace it with `{{replacement}}` to name the parsed direction explicitly.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      TSTypeReference(rawNode) {
        const node = rawNode as AstNode;
        const name = qualifiedTypeName(node);
        if (name && zod.roots.has(name.namespace) && name.name === "infer") {
          const correction = correctionFromEdits(context.sourceCode.text, node, [
            replaceNode(node.typeName?.right, "output"),
          ]);
          if (correction) {
            context.report({
              node: rawNode,
              messageId: "preferOutputWithFix",
              data: { replacement: correction.replacement },
              fix: correction.fix,
            });
          } else {
            context.report({ node: rawNode, messageId: "preferOutput" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default zinferInsteadOfZoutput;
