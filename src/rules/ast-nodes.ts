import type { AstNode } from "./types.ts";

const transparentTypeScriptExpressionTypes = new Set([
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

/** Identifies ESTree-compatible nodes without chaining type assertions. */
export function isAstNode(value: unknown): value is AstNode {
  return value !== null && !Array.isArray(value) && Reflect.has(Object(value), "type");
}

/** Returns only ESTree-compatible values from an Oxlint node collection. */
export function astNodes(values: readonly unknown[]): AstNode[] {
  return values.filter(isAstNode);
}

/** Removes transparent TypeScript wrappers from an expression. */
export function unwrapTypeScriptExpression(node: AstNode | null | undefined): AstNode | undefined {
  let current = node ?? undefined;
  while (
    current &&
    transparentTypeScriptExpressionTypes.has(current.type) &&
    isAstNode(current.expression)
  ) {
    current = current.expression;
  }
  return current;
}
