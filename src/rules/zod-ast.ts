import type { AstNode } from "./types.ts";

const transparentExpressionTypes = new Set([
  "ChainExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSInstantiationExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

export const zodObjectConstructors = new Set(["looseObject", "object", "strictObject"]);

export function unwrapExpression(node: AstNode | null | undefined): AstNode | undefined {
  let current = node ?? undefined;
  while (current && transparentExpressionTypes.has(current.type)) {
    current = current.expression;
  }
  return current;
}

export function propertyName(node: AstNode | null | undefined): string | undefined {
  const current = unwrapExpression(node);
  if (current?.type === "Identifier") {
    return current.name;
  }
  if (current?.type === "Literal" && current.value !== undefined) {
    return current.value as string;
  }
  return undefined;
}

export function memberName(node: AstNode | null | undefined): string | undefined {
  const current = unwrapExpression(node);
  return current?.type === "MemberExpression" ? propertyName(current.property) : undefined;
}

export function calleeName(node: AstNode | null | undefined): string | undefined {
  const current = unwrapExpression(node);
  if (current?.type === "Identifier") {
    return current.name;
  }
  return memberName(current);
}

export function isMethodCall(node: AstNode | null | undefined, method: string): boolean {
  const current = unwrapExpression(node);
  return current?.type === "CallExpression" && memberName(current.callee) === method;
}

export function methodReceiver(node: AstNode | null | undefined): AstNode | undefined {
  const current = unwrapExpression(node);
  const callee = unwrapExpression(current?.callee);
  return callee?.type === "MemberExpression" ? unwrapExpression(callee.object) : undefined;
}

export function isDirectZodCall(node: AstNode | null | undefined, name: string): boolean {
  const current = unwrapExpression(node);
  const callee = unwrapExpression(current?.callee);
  const object = unwrapExpression(callee?.object);
  return (
    current?.type === "CallExpression" &&
    callee?.type === "MemberExpression" &&
    object?.type === "Identifier" &&
    object.name === "z" &&
    memberName(callee) === name
  );
}

export function zodRootConstructor(node: AstNode | null | undefined): string | undefined {
  const current = unwrapExpression(node);
  if (current?.type !== "CallExpression") {
    return undefined;
  }

  const callee = unwrapExpression(current.callee);
  if (callee?.type !== "MemberExpression") {
    return undefined;
  }

  const object = unwrapExpression(callee.object);
  if (object?.type === "Identifier" && object.name === "z") {
    return memberName(callee);
  }
  return zodRootConstructor(object);
}

export function chainHasMethod(
  node: AstNode | null | undefined,
  methods: ReadonlySet<string>,
): boolean {
  const current = unwrapExpression(node);
  if (current?.type !== "CallExpression") {
    return false;
  }

  const callee = unwrapExpression(current.callee);
  if (callee?.type !== "MemberExpression") {
    return false;
  }

  const name = memberName(callee);
  return (name !== undefined && methods.has(name)) || chainHasMethod(callee.object, methods);
}

export function hasProperty(node: AstNode | null | undefined, name: string): boolean {
  const current = unwrapExpression(node);
  return (
    current?.type === "ObjectExpression" &&
    (current.properties ?? []).some(
      (property) => property.type === "Property" && propertyName(property.key) === name,
    )
  );
}

export function qualifiedTypeName(
  node: AstNode | null | undefined,
): { namespace: string; name: string } | undefined {
  const current = unwrapExpression(node);
  const typeName = unwrapExpression(current?.typeName);
  if (current?.type !== "TSTypeReference" || typeName?.type !== "TSQualifiedName") {
    return undefined;
  }

  const left = unwrapExpression(typeName.left);
  const right = unwrapExpression(typeName.right);
  if (left?.type !== "Identifier" || right?.type !== "Identifier") {
    return undefined;
  }
  if (left.name === undefined || right.name === undefined) {
    return undefined;
  }
  return { namespace: left.name, name: right.name };
}

export function isFunctionNode(node: AstNode | null | undefined): boolean {
  return (
    node?.type === "ArrowFunctionExpression" ||
    node?.type === "FunctionDeclaration" ||
    node?.type === "FunctionExpression"
  );
}

export function enclosingRefinementCall(ancestors: readonly AstNode[]): AstNode | undefined {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const callback = ancestors[index];
    const parent = ancestors[index - 1];
    if (
      isFunctionNode(callback) &&
      parent?.type === "CallExpression" &&
      (parent.arguments ?? []).includes(callback!) &&
      ["check", "refine", "superRefine"].includes(memberName(parent.callee) ?? "")
    ) {
      return parent;
    }
  }
  return undefined;
}

export function isInsideTryBlock(ancestors: readonly AstNode[]): boolean {
  return ancestors.some((ancestor, index) => {
    if (ancestor.type !== "TryStatement") {
      return false;
    }
    return ancestors[index + 1] === ancestor.block;
  });
}

export function isPrimitiveLiteral(node: AstNode | null | undefined): boolean {
  const current = unwrapExpression(node);
  if (current?.type !== "Literal") {
    return false;
  }
  const constructor = (current.value as { constructor?: unknown } | null)?.constructor;
  return current.value === null || [Boolean, Number, String].includes(constructor as never);
}

export function primitiveLiteralKind(node: AstNode): string {
  if (node.value === null) {
    return "null";
  }
  const constructor = (node.value as { constructor?: unknown }).constructor;
  if (constructor === Boolean) {
    return "boolean";
  }
  if (constructor === Number) {
    return "number";
  }
  return "string";
}

export function isToolDefinitionCall(node: AstNode | null | undefined): boolean {
  const name = calleeName(unwrapExpression(node)?.callee);
  return name === "defineTool" || name === "defineDomainTool";
}

export function isToolInputProperty(property: AstNode, ancestors: readonly AstNode[]): boolean {
  if (
    property.type !== "Property" ||
    !["input", "inputSchema"].includes(propertyName(property.key) ?? "")
  ) {
    return false;
  }

  const objectIndex = ancestors.findLastIndex((ancestor) => ancestor.type === "ObjectExpression");
  const parent = ancestors[objectIndex - 1];
  return parent?.type === "CallExpression" && isToolDefinitionCall(parent);
}
