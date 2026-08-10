/**
 * Detects `const` schema declarations annotated as `z.ZodType<T>` or `z.ZodSchema<T>`. The
 * annotation erases the concrete schema class. `satisfies` checks the contract without widening the
 * value.
 *
 * Flags: `const userSchema: z.ZodType<User> = z.object({ id: z.string() });`
 *
 * Does not flag: a schema that uses `satisfies` or a recursive declaration that needs an annotation.
 * It also permits an exported opaque schema or a mutable `let` declaration.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  astSubtreeSome,
  createZodImportState,
  qualifiedTypeName,
  unwrapExpression,
  zodRootConstructor,
  zodImportVisitor,
} from "./zod-ast.ts";

const concreteSchemaConstructors = new Set(["enum", "looseObject", "object", "strictObject"]);

function annotatedZodType(
  identifier: AstNode | null | undefined,
  roots: ReadonlySet<string>,
): boolean {
  const annotation = unwrapExpression(identifier?.typeAnnotation);
  const type = unwrapExpression(annotation?.typeAnnotation);
  const name = qualifiedTypeName(type);
  return Boolean(
    name && roots.has(name.namespace) && (name.name === "ZodSchema" || name.name === "ZodType"),
  );
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
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      VariableDeclaration(rawNode) {
        const node = rawNode as AstNode;
        if (node.kind !== "const") {
          return;
        }

        const ancestors = context.sourceCode.getAncestors(rawNode) as unknown as AstNode[];
        if (ancestors.some((ancestor) => ancestor.type.startsWith("Export"))) {
          return;
        }

        for (const declaration of node.declarations ?? []) {
          const identifier = declaration.id;
          const constructor = zodRootConstructor(declaration.init, zod.roots);
          const selfReferences =
            identifier?.type === "Identifier" &&
            identifier.name !== undefined &&
            astSubtreeSome(
              declaration.init,
              (candidate) => candidate.type === "Identifier" && candidate.name === identifier.name,
            );
          if (
            annotatedZodType(identifier, zod.roots) &&
            constructor !== undefined &&
            concreteSchemaConstructors.has(constructor) &&
            !selfReferences
          ) {
            context.report({ node: rawNode, messageId: "preferSatisfies" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default zodtypeAnnotationInsteadOfSatisfies;
