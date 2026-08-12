/**
 * Detects generic helper parameters written as `z.ZodType<T>`. That form preserves only the output
 * and erases the schema input type and concrete class. Helpers should use the schema as the generic.
 *
 * Flags: `function parse<T>(schema: z.ZodType<T>): T { return schema.parse(value); }`
 *
 * Does not flag: `function parse<S extends z.ZodType>(schema: S): z.output<S> { ... }` or a function
 * that merely returns `z.ZodType<T>` without accepting one as a parameter. It also leaves an
 * explicit `z.ZodType<Output, Input>` alone because that helper preserves both directions.
 */
import { astNodes, isAstNode } from "./ast-nodes.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import {
  createZodImportState,
  isFunctionNode,
  qualifiedTypeName,
  unwrapExpression,
  zodImportVisitor,
} from "./zod-ast.ts";

function typeParameterName(node: AstNode | null | undefined): string | undefined {
  const name = node?.name;
  if (name === undefined) {
    return undefined;
  }
  if (isAstNode(name)) {
    return name.type === "Identifier" ? String(name.name) : undefined;
  }
  return String(name);
}

const zodtypeTGenericHelper = {
  meta: {
    type: "problem",
    docs: {
      description: "Preserve schema input and output types in generic Zod helpers",
    },
    messages: {
      preserveSchema:
        "z.ZodType<T> erases this parameter's input type and concrete schema class. Accept `S extends z.ZodType`, type the parameter as `S`, and return `z.output<S>`.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      TSTypeReference(rawNode) {
        const node = rawNode as AstNode;
        const qualifiedName = qualifiedTypeName(node);
        if (
          !qualifiedName ||
          !zod.roots.has(qualifiedName.namespace) ||
          qualifiedName.name !== "ZodType"
        ) {
          return;
        }

        const arguments_ = node.typeArguments?.params ?? node.typeParameters?.params ?? [];
        if (arguments_.length !== 1) {
          return;
        }
        const [argument] = arguments_;
        const typeArgument = unwrapExpression(argument);
        const argumentTypeName =
          typeArgument?.type === "TSTypeReference"
            ? unwrapExpression(typeArgument.typeName)
            : typeArgument;
        if (argumentTypeName?.type !== "Identifier" || argumentTypeName.name === undefined) {
          return;
        }

        const ancestors = astNodes(context.sourceCode.getAncestors(rawNode));
        const functionIndex = ancestors.findLastIndex(isFunctionNode);
        const fn = ancestors[functionIndex];
        if (!fn) {
          return;
        }

        const isDirectParameterType = (fn.params ?? []).some((parameter) => {
          const annotation = unwrapExpression(parameter.typeAnnotation);
          return unwrapExpression(annotation?.typeAnnotation) === node;
        });
        const declaresType = (fn.typeParameters?.params ?? []).some(
          (parameter) => typeParameterName(parameter) === argumentTypeName.name,
        );
        if (isDirectParameterType && declaresType) {
          context.report({ node: rawNode, messageId: "preserveSchema" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default zodtypeTGenericHelper;
