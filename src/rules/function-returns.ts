/**
 * @fileoverview Collects one function's return expressions without entering nested functions.
 *
 * Several policy rules compare success and failure branches. Central collection gives those rules
 * the same behavior for block functions, concise arrows, and conditional expressions.
 */
import { isAstNode } from "./ast-nodes.ts";
import type { AstNode } from "./types.ts";
import { isFunctionNode, unwrapExpression } from "./zod-ast.ts";

export interface FunctionReturn {
  readonly node: AstNode;
  readonly value?: AstNode;
}

function astChildren(node: AstNode): AstNode[] {
  const children: AstNode[] = [];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) {
          children.push(item);
        }
      }
    } else if (isAstNode(value)) {
      children.push(value);
    }
  }
  return children;
}

/** Collects returns owned by one function and skips every nested function boundary. */
export function collectFunctionReturns(functionNode: AstNode): FunctionReturn[] {
  const body = unwrapExpression(Array.isArray(functionNode.body) ? undefined : functionNode.body);
  if (!body) {
    return [];
  }
  if (body.type !== "BlockStatement") {
    return [{ node: body, value: body }];
  }

  const returns: FunctionReturn[] = [];
  const seen = new Set<AstNode>();

  function visit(node: AstNode): void {
    if (seen.has(node)) {
      return;
    }
    seen.add(node);

    if (node.type === "ReturnStatement") {
      returns.push({ node, value: unwrapExpression(node.argument) });
      return;
    }
    if (node !== body && isFunctionNode(node)) {
      return;
    }
    for (const child of astChildren(node)) {
      visit(child);
    }
  }

  visit(body);
  return returns;
}

/** Expands conditional returns so policy rules inspect each observable branch. */
export function expandReturnBranches(entry: FunctionReturn): FunctionReturn[] {
  const value = unwrapExpression(entry.value);
  if (value?.type !== "ConditionalExpression") {
    return [{ node: entry.node, value }];
  }
  return [
    ...expandReturnBranches({ node: value.consequent!, value: value.consequent }),
    ...expandReturnBranches({ node: value.alternate!, value: value.alternate ?? undefined }),
  ];
}
