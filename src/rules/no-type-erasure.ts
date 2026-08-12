/**
 * @fileoverview Preserves concrete TypeScript object information at runtime boundaries.
 *
 * Detects broad TypeScript object types and generic `isRecord` calls. These forms erase known
 * properties and force later code to recover information with casts or repeated checks.
 *
 * Flags: `type Data = object;`, `isRecord(value);`, and `Object(value) === value`.
 *
 * Does not flag: `type Data = { id: string };` or `isUser(value);`
 */
import type { AstNode, OxlintRule } from "./types.ts";
import { unwrapExpression } from "./zod-ast.ts";

const identityOperators = new Set(["!=", "!==", "==", "==="]);

function sameReference(first: AstNode | undefined, second: AstNode | undefined): boolean {
  const left = unwrapExpression(first);
  const right = unwrapExpression(second);
  if (!left || !right || left.type !== right.type) {
    return false;
  }
  if (left.type === "Identifier" || left.type === "PrivateIdentifier") {
    return left.name === right.name;
  }
  if (left.type === "ThisExpression" || left.type === "Super") {
    return true;
  }
  if (left.type === "Literal") {
    return left.value === right.value;
  }
  if (left.type !== "MemberExpression") {
    return false;
  }
  return (
    left.computed === right.computed &&
    sameReference(left.object, right.object) &&
    sameReference(left.property, right.property)
  );
}

function objectIdentityArgument(node: AstNode | undefined): AstNode | undefined {
  const current = unwrapExpression(node);
  if (
    current?.type !== "CallExpression" ||
    current.callee?.type !== "Identifier" ||
    current.callee.name !== "Object" ||
    current.arguments?.length !== 1
  ) {
    return undefined;
  }
  return unwrapExpression(current.arguments[0]);
}

function isObjectIdentityCheck(node: AstNode): boolean {
  if (!identityOperators.has(node.operator ?? "")) {
    return false;
  }
  const leftArgument = objectIdentityArgument(node.left);
  const rightArgument = objectIdentityArgument(node.right);
  return sameReference(leftArgument, node.right) || sameReference(rightArgument, node.left);
}

function calleeName(node: AstNode | undefined): string | undefined {
  const current = unwrapExpression(node);
  if (current?.type === "Identifier") {
    return current.name;
  }
  if (current?.type !== "MemberExpression") {
    return undefined;
  }
  if (current.property?.type === "Identifier") {
    return current.property.name;
  }
  const value = current.property?.value;
  return current.computed && current.property?.type === "Literal" && value !== undefined
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
      objectIdentity:
        "Avoid Object(value) identity checks. Validate a concrete domain shape or discriminant instead.",
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
      BinaryExpression(rawNode) {
        if (isObjectIdentityCheck(rawNode as AstNode)) {
          context.report({ node: rawNode, messageId: "objectIdentity" });
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
