/**
 * @fileoverview Preserves concrete TypeScript object information at runtime boundaries.
 *
 * Detects broad TypeScript object types and generic `isRecord` calls. These forms erase known
 * properties and force later code to recover information with casts or repeated checks.
 *
 * Flags: `type Data = object;` and `isRecord(value);`
 *
 * Does not flag: `type Data = { id: string };` or `isUser(value);`
 */
import type { AstNode, OxlintRule } from "./types.ts";

function calleeName(node: AstNode | undefined): string | undefined {
  if (node?.type === "ChainExpression") {
    const expression = node.expression;
    return Object(expression) === expression ? calleeName(expression as AstNode) : undefined;
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
      description: "Disallow broad object types and generic record guards",
    },
    messages: {
      broadObject:
        "This broad object type discards known property evidence. Use the expected owner type, or parse external input into a concrete domain type at its boundary.",
      isRecord:
        "isRecord() proves only a broad container shape. Replace it with a domain-specific guard such as `isUser(value)`, or parse the value with its boundary schema.",
    },
    schema: [],
  },
  create(context) {
    return {
      TSTypeReference(rawNode) {
        const node = rawNode as AstNode;
        if (node.typeName?.type === "Identifier" && node.typeName.name === "Object") {
          context.report({ node: rawNode, messageId: "broadObject" });
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
        const body = (rawNode as AstNode).body;
        if (Array.isArray(body) && body.length === 0) {
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
