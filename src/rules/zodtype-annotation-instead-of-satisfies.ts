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
import {
  correctionFromEdits,
  removeRange,
  sourceTextForNode,
  type TextEdit,
} from "./corrections.ts";
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
    fixable: "code",
    messages: {
      preferSatisfies:
        "A z.ZodType<T> annotation widens this concrete schema. Move the contract to a satisfies expression so the schema methods and input type remain available.",
      preferSatisfiesWithFix:
        "A z.ZodType<T> annotation widens this concrete schema. Replace the declaration with `{{replacement}}` so the schema methods and input type remain available.",
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
            const annotation = unwrapExpression(identifier?.typeAnnotation);
            const contract = sourceTextForNode(
              context.sourceCode.text,
              unwrapExpression(annotation?.typeAnnotation),
            );
            const insertion: TextEdit | undefined =
              declaration.init?.end === undefined || contract === undefined
                ? undefined
                : {
                    range: [declaration.init.end, declaration.init.end],
                    text: ` satisfies ${contract}`,
                  };
            const correction = correctionFromEdits(context.sourceCode.text, node, [
              removeRange(annotation?.start, annotation?.end),
              insertion,
            ]);

            if (correction) {
              context.report({
                node: rawNode,
                messageId: "preferSatisfiesWithFix",
                data: { replacement: correction.replacement },
                fix: correction.fix,
              });
            } else {
              context.report({ node: rawNode, messageId: "preferSatisfies" });
            }
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default zodtypeAnnotationInsteadOfSatisfies;
