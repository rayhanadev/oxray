/**
 * Detects generic helper parameters written as `z.ZodType<T>` where `T` is the function's type
 * parameter, because that form preserves only the output and erases the schema's input type and
 * concrete class; helpers should be generic over the schema itself.
 *
 * Flags: `function parse<T>(schema: z.ZodType<T>): T { return schema.parse(value); }`
 *
 * Does not flag: `function parse<S extends z.ZodType>(schema: S): z.output<S> { ... }` or a function
 * that merely returns `z.ZodType<T>` without accepting one as a parameter.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import { isFunctionNode, qualifiedTypeName, unwrapExpression } from "./zod-ast.ts";

function typeParameterName(node: AstNode | null | undefined): string | undefined {
  const name = node?.name;
  if (name === undefined) {
    return undefined;
  }
  if (Object(name) !== name) {
    return String(name);
  }
  const nameNode = name as unknown as AstNode;
  return nameNode.type === "Identifier" ? String(nameNode.name) : undefined;
}

const zodtypeTGenericHelper = {
  meta: {
    type: "problem",
    docs: {
      description: "Preserve schema input and output types in generic Zod helpers",
    },
    messages: {
      preserveSchema:
        "Accept `S extends z.ZodType` and return z.output<S>; z.ZodType<T> erases the schema's input type and concrete class.",
    },
    schema: [],
  },
  create(context) {
    return {
      TSTypeReference(rawNode) {
        const node = rawNode as AstNode;
        const qualifiedName = qualifiedTypeName(node);
        if (qualifiedName?.namespace !== "z" || qualifiedName.name !== "ZodType") {
          return;
        }

        const [argument] = node.typeArguments?.params ?? node.typeParameters?.params ?? [];
        const typeArgument = unwrapExpression(argument);
        const argumentTypeName =
          typeArgument?.type === "TSTypeReference"
            ? unwrapExpression(typeArgument.typeName)
            : typeArgument;
        if (argumentTypeName?.type !== "Identifier" || argumentTypeName.name === undefined) {
          return;
        }

        const ancestors = context.sourceCode.getAncestors(rawNode) as unknown as AstNode[];
        const functionIndex = ancestors.findLastIndex(isFunctionNode);
        const fn = ancestors[functionIndex];
        if (!fn) {
          return;
        }

        const isParameterType = (fn.params ?? []).some((parameter) =>
          ancestors.includes(parameter),
        );
        const declaresType = (fn.typeParameters?.params ?? []).some(
          (parameter) => typeParameterName(parameter) === argumentTypeName.name,
        );
        if (isParameterType && declaresType) {
          context.report({ node: rawNode, messageId: "preserveSchema" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default zodtypeTGenericHelper;
