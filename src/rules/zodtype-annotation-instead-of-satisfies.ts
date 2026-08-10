/**
 * Detects `const` schema declarations annotated as `z.ZodType<T>` or `z.ZodSchema<T>`, because the
 * annotation erases the concrete schema class and its specific methods while `satisfies` checks the
 * same contract without widening the declared value.
 *
 * Flags: `const userSchema: z.ZodType<User> = z.object({ id: z.string() });`
 *
 * Does not flag: `const userSchema = z.object({ id: z.string() }) satisfies z.ZodType<User>;` or a
 * mutable `let` declaration whose annotation intentionally controls later assignments.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import { qualifiedTypeName, unwrapExpression, zodRootConstructor } from "./zod-ast.ts";

function annotatedZodType(identifier: AstNode | null | undefined): boolean {
  const annotation = unwrapExpression(identifier?.typeAnnotation);
  const type = unwrapExpression(annotation?.typeAnnotation);
  const name = qualifiedTypeName(type);
  return name?.namespace === "z" && (name.name === "ZodSchema" || name.name === "ZodType");
}

const zodtypeAnnotationInsteadOfSatisfies = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Use satisfies for concrete Zod schema declarations",
    },
    messages: {
      preferSatisfies:
        "Use `const schema = ... satisfies z.ZodType<T>` so the concrete schema methods and input type are preserved.",
    },
    schema: [],
  },
  create(context) {
    return {
      VariableDeclaration(rawNode) {
        const node = rawNode as AstNode;
        if (node.kind !== "const") {
          return;
        }

        for (const declaration of node.declarations ?? []) {
          if (
            annotatedZodType(declaration.id) &&
            zodRootConstructor(declaration.init) !== undefined
          ) {
            context.report({ node: rawNode, messageId: "preferSatisfies" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default zodtypeAnnotationInsteadOfSatisfies;
