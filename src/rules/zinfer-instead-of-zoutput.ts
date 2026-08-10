/**
 * Detects the `z.infer` type alias, because `z.output` is runtime-equivalent but states explicitly
 * that the post-parse type is wanted and stays clear if the schema later gains a transform or codec.
 *
 * Flags: `type User = z.infer<typeof userSchema>;`
 *
 * Does not flag: `type User = z.output<typeof userSchema>;` or `z.input<typeof userSchema>`.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import { createZodImportState, qualifiedTypeName, zodImportVisitor } from "./zod-ast.ts";

const zinferInsteadOfZoutput = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer direction-explicit z.output over z.infer",
    },
    messages: {
      preferOutput: "Use z.output<typeof schema> instead of the direction-ambiguous z.infer alias.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      TSTypeReference(rawNode) {
        const name = qualifiedTypeName(rawNode as AstNode);
        if (name && zod.roots.has(name.namespace) && name.name === "infer") {
          context.report({ node: rawNode, messageId: "preferOutput" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default zinferInsteadOfZoutput;
