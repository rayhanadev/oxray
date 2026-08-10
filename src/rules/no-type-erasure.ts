/**
 * Detects broad TypeScript object types and generic `isRecord` calls that erase known properties,
 * because that lost shape forces downstream code to recover type information with casts or
 * repetitive runtime checks.
 *
 * Flags: `type Data = Record<string, unknown>;` and `isRecord(value);`
 *
 * Does not flag: `type Users = Record<string, User>;` or `isUser(value);`
 */
import type { AstNode, OxlintRule } from "./types.ts";

function isBroadValueType(node: AstNode | undefined): boolean {
  return node?.type === "TSAnyKeyword" || node?.type === "TSUnknownKeyword";
}

function unwrapTypeAnnotation(node: AstNode | undefined): AstNode | undefined {
  return node?.type === "TSTypeAnnotation" ? node.typeAnnotation : node;
}

function isBroadRecord(node: AstNode): boolean {
  if (node.typeName?.type !== "Identifier" || node.typeName.name !== "Record") {
    return false;
  }

  const typeArguments = node.typeArguments ?? node.typeParameters;
  const [keyType, valueType] = typeArguments?.params ?? [];
  return keyType?.type === "TSStringKeyword" && isBroadValueType(valueType);
}

function isBroadStringIndex(node: AstNode): boolean {
  const [parameter] = node.parameters ?? node.params ?? [];
  const keyType = unwrapTypeAnnotation(parameter?.typeAnnotation);
  const valueType = unwrapTypeAnnotation(node.typeAnnotation);
  return keyType?.type === "TSStringKeyword" && isBroadValueType(valueType);
}

function calleeName(node: AstNode | undefined): string | undefined {
  if (node?.type === "ChainExpression") {
    return calleeName(node.expression);
  }

  if (node?.type === "Identifier") {
    return node.name;
  }

  if (node?.type !== "MemberExpression") {
    return undefined;
  }

  if (node.property?.type === "Identifier") {
    return node.property.name;
  }

  const value = node.property?.value;
  return node.computed && node.property?.type === "Literal" && value !== undefined
    ? (value as string)
    : undefined;
}

const noTypeErasure = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow broad object types and generic record guards that erase known shapes",
    },
    messages: {
      broadObject:
        "Avoid broad object types that erase known properties. Preserve a concrete object shape instead.",
      broadRecord:
        "Avoid records with broad string keys and any/unknown values. Preserve a concrete object shape instead.",
      isRecord:
        "Avoid isRecord(). Write a domain-specific type guard that narrows to a concrete object shape.",
    },
    schema: [],
  },
  create(context) {
    return {
      TSTypeReference(rawNode) {
        const node = rawNode as AstNode;
        if (isBroadRecord(node)) {
          context.report({ node: rawNode, messageId: "broadRecord" });
        } else if (node.typeName?.type === "Identifier" && node.typeName.name === "Object") {
          context.report({ node: rawNode, messageId: "broadObject" });
        }
      },
      TSIndexSignature(rawNode) {
        if (isBroadStringIndex(rawNode as AstNode)) {
          context.report({ node: rawNode, messageId: "broadRecord" });
        }
      },
      TSObjectKeyword(node) {
        context.report({ node, messageId: "broadObject" });
      },
      TSTypeLiteral(rawNode) {
        if ((rawNode as AstNode).members?.length === 0) {
          context.report({ node: rawNode, messageId: "broadObject" });
        }
      },
      TSInterfaceBody(rawNode) {
        if ((rawNode as AstNode).body?.length === 0) {
          context.report({ node: rawNode, messageId: "broadObject" });
        }
      },
      CallExpression(rawNode) {
        if (calleeName((rawNode as AstNode).callee) === "isRecord") {
          context.report({ node: rawNode, messageId: "isRecord" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default noTypeErasure;
