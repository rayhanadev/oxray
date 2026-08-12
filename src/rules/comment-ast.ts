/**
 * @fileoverview Resolves declarations that comment rules treat as documentation targets.
 *
 * The resolver keeps export and adjacency logic in one place so every documentation rule reports
 * the same declaration.
 */
import { directlyPrecedingComment, type CommentSourceCode } from "../analysis/comments.ts";
import type { AstNode, SourceComment } from "./types.ts";

export interface DocumentationTarget {
  host: AstNode;
  node: AstNode;
}

const functionOrClassTypes = new Set([
  "ArrowFunctionExpression",
  "ClassDeclaration",
  "ClassExpression",
  "FunctionDeclaration",
  "FunctionExpression",
  "TSDeclareFunction",
]);
const transparentExpressionTypes = new Set([
  "ChainExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSInstantiationExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

function unwrapDocumentationExpression(node: AstNode | null | undefined): AstNode | undefined {
  let current = node ?? undefined;
  while (current && transparentExpressionTypes.has(current.type)) {
    const expression = current.expression;
    current = Object(expression) === expression ? (expression as AstNode) : undefined;
  }
  return current;
}

/** Identifies declarations that can own callable or class documentation. */
export function isFunctionOrClass(node: AstNode | null | undefined): boolean {
  return Boolean(node && functionOrClassTypes.has(node.type));
}

function boundNames(node: AstNode | null | undefined): string[] {
  if (!node) {
    return [];
  }
  if (node.type === "Identifier" && node.name) {
    return [node.name];
  }
  if (node.type === "RestElement") {
    return boundNames(node.argument);
  }
  if (node.type === "AssignmentPattern") {
    return boundNames(node.left);
  }
  if (node.type === "ArrayPattern") {
    return (node.elements ?? []).flatMap((element) => boundNames(element));
  }
  if (node.type === "ObjectPattern") {
    return (node.properties ?? []).flatMap((property) =>
      boundNames(property.type === "Property" ? (property.value as AstNode) : property.argument),
    );
  }
  return [];
}

function declarationsIn(statement: AstNode): DocumentationTarget[] {
  if (isFunctionOrClass(statement)) {
    return [{ host: statement, node: statement }];
  }
  if (statement.type !== "VariableDeclaration") {
    return [];
  }
  return (statement.declarations ?? [])
    .map((declaration) => ({ declaration, node: unwrapDocumentationExpression(declaration.init) }))
    .filter((entry): entry is { declaration: AstNode; node: AstNode } =>
      isFunctionOrClass(entry.node),
    )
    .map((entry) => ({ host: statement, node: entry.node }));
}

function declarationIndex(program: AstNode): Map<string, DocumentationTarget> {
  const index = new Map<string, DocumentationTarget>();
  for (const statement of Array.isArray(program.body) ? program.body : []) {
    const declaration =
      statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
        ? statement.declaration
        : statement;
    if (!declaration) {
      continue;
    }
    if (isFunctionOrClass(declaration)) {
      for (const name of boundNames(declaration.id)) {
        index.set(name, { host: statement, node: declaration });
      }
      continue;
    }
    if (declaration.type === "VariableDeclaration") {
      for (const variable of declaration.declarations ?? []) {
        const initializer = unwrapDocumentationExpression(variable.init);
        if (!isFunctionOrClass(initializer)) {
          continue;
        }
        for (const name of boundNames(variable.id)) {
          index.set(name, { host: statement, node: initializer! });
        }
      }
    }
  }
  return index;
}

/** Resolves direct and local exports because both forms create the same public contract. */
export function exportedDocumentationTargets(program: AstNode): DocumentationTarget[] {
  const targets: DocumentationTarget[] = [];
  const localDeclarations = declarationIndex(program);
  for (const statement of Array.isArray(program.body) ? program.body : []) {
    if (statement.type === "ExportNamedDeclaration" && statement.declaration) {
      targets.push(
        ...declarationsIn(statement.declaration).map((target) => ({
          host: statement,
          node: target.node,
        })),
      );
      continue;
    }
    if (statement.type === "ExportDefaultDeclaration" && statement.declaration) {
      const declaration = unwrapDocumentationExpression(statement.declaration);
      if (isFunctionOrClass(declaration)) {
        targets.push({ host: statement, node: declaration! });
      } else if (statement.declaration.type === "Identifier" && statement.declaration.name) {
        const target = localDeclarations.get(statement.declaration.name);
        if (target) {
          targets.push(target);
        }
      }
      continue;
    }
    if (statement.type !== "ExportNamedDeclaration") {
      continue;
    }
    for (const specifier of statement.specifiers ?? []) {
      const name = specifier.local?.name;
      const target = name ? localDeclarations.get(name) : undefined;
      if (target) {
        targets.push(target);
      }
    }
  }
  const seenNodes = new Set<AstNode>();
  const seenNames = new Set<string>();
  return targets.filter((target) => {
    if (seenNodes.has(target.node)) {
      return false;
    }
    seenNodes.add(target.node);
    const names = boundNames(target.node.id);
    if (names.length === 0) {
      return true;
    }
    if (names.every((name) => seenNames.has(name))) {
      return false;
    }
    for (const name of names) {
      seenNames.add(name);
    }
    return true;
  });
}

/** Finds the syntax node that owns a declaration comment when syntax nests expressions. */
export function documentationHost(sourceCode: CommentSourceCode, node: AstNode): AstNode | null {
  const reversed = sourceCode.getAncestors(node).toReversed();
  for (const [index, ancestor] of reversed.entries()) {
    if (ancestor.type === "VariableDeclarator") {
      if (unwrapDocumentationExpression(ancestor.init) !== node) {
        return null;
      }
      return reversed.slice(index + 1).find((item) => item.type === "VariableDeclaration") ?? node;
    }
    if (ancestor.type === "Property" || ancestor.type === "PropertyDefinition") {
      const value = Object(ancestor.value) === ancestor.value ? (ancestor.value as AstNode) : null;
      return unwrapDocumentationExpression(value) === node ? ancestor : null;
    }
    if (ancestor.type === "MethodDefinition") {
      return ancestor;
    }
    if (functionOrClassTypes.has(ancestor.type)) {
      break;
    }
  }
  return node;
}

/** Finds documentation beside an export wrapper or its declaration without crossing blank lines. */
export function adjacentDocumentation(
  sourceCode: CommentSourceCode,
  target: DocumentationTarget,
): SourceComment | null {
  return (
    directlyPrecedingComment(sourceCode, target.host) ??
    (target.node === target.host ? null : directlyPrecedingComment(sourceCode, target.node))
  );
}

/** Returns a declaration name when redundancy checks can compare it with prose. */
export function declarationName(node: AstNode): string | null {
  if (node.id?.name) {
    return node.id.name;
  }
  if (node.key?.name) {
    return node.key.name;
  }
  return null;
}
