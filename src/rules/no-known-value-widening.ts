/**
 * @fileoverview Prevents explicit target types from discarding known value evidence.
 *
 * The rule follows stable local constants and checks annotations, assignments, returns, and casts.
 * Empty dictionary accumulators remain valid because they gain keys after initialization.
 */
import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

import {
  classifyWideningTarget,
  createTypeEnvironment,
  isKnownEvidenceExpression,
  type TypeEnvironment,
  type WideningTarget,
} from "./type-evidence.ts";

type FunctionExpression = ESTree.ArrowFunctionExpression | ESTree.Function;

function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
  let current = expression;
  while (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression"
  ) {
    current = current.expression;
  }
  return current;
}

function resolveVariable(
  sourceCode: SourceCode,
  identifier: ESTree.IdentifierReference,
): Variable | null {
  let scope: Scope | null = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      return variable;
    }
    scope = scope.upper;
  }
  return null;
}

function variableDeclarator(variable: Variable): ESTree.VariableDeclarator | null {
  if (variable.defs.length !== 1) {
    return null;
  }
  const [definition] = variable.defs;
  return definition?.type === "Variable" && definition.node.type === "VariableDeclarator"
    ? definition.node
    : null;
}

function isStableConst(variable: Variable, declarator: ESTree.VariableDeclarator): boolean {
  return (
    declarator.parent.type === "VariableDeclaration" &&
    declarator.parent.kind === "const" &&
    variable.references.every((reference) => reference.init || !reference.isWrite())
  );
}

function hasKnownEvidence(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  visited = new Set<Variable>(),
): boolean {
  if (isKnownEvidenceExpression(expression)) {
    return true;
  }
  const unwrapped = unwrapExpression(expression);
  if (unwrapped.type !== "Identifier") {
    return false;
  }
  const variable = resolveVariable(sourceCode, unwrapped);
  if (variable === null || visited.has(variable)) {
    return false;
  }
  const declarator = variableDeclarator(variable);
  if (declarator === null || declarator.init === null || !isStableConst(variable, declarator)) {
    return false;
  }
  visited.add(variable);
  return hasKnownEvidence(sourceCode, declarator.init, visited);
}

function annotationTarget(
  annotation: ESTree.TSTypeAnnotation | null | undefined,
  environment: TypeEnvironment,
): WideningTarget | null {
  return annotation === null || annotation === undefined
    ? null
    : classifyWideningTarget(annotation.typeAnnotation, environment);
}

function enclosingFunction(node: ESTree.Node): FunctionExpression | null {
  let current: ESTree.Node | null = node.parent;
  while (current !== null && current.type !== "Program") {
    if (
      current.type === "ArrowFunctionExpression" ||
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression"
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function sourceKeyName(sourceCode: SourceCode, key: ESTree.PropertyKey): string {
  if (key.type === "Identifier" || key.type === "PrivateIdentifier") {
    return key.name;
  }
  if (key.type === "Literal") {
    return String(key.value);
  }
  return sourceCode.getText(key);
}

function functionName(sourceCode: SourceCode, owner: FunctionExpression | null): string {
  if (owner === null) {
    return "anonymous function";
  }
  if (owner.id !== null) {
    return owner.id.name;
  }
  const parent = owner.parent;
  if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
    return parent.id.name;
  }
  if (parent.type === "MethodDefinition") {
    return sourceKeyName(sourceCode, parent.key);
  }
  return "anonymous function";
}

function isEmptyObject(expression: ESTree.Expression): boolean {
  const unwrapped = unwrapExpression(expression);
  return unwrapped.type === "ObjectExpression" && unwrapped.properties.length === 0;
}

function isDictionaryAccumulator(target: WideningTarget): boolean {
  return target.kind === "open dictionary" || target.kind === "generic container";
}

function hasParentAssertion(node: ESTree.Node): boolean {
  return node.parent?.type === "TSAsExpression" || node.parent?.type === "TSTypeAssertion";
}

const noKnownValueWidening = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow explicit target types that discard established value evidence",
    },
    messages: {
      widening:
        "The known initializer for {{subject}} loses evidence through an explicit {{target}} target. Preserve inference, use satisfies, or use a named owner contract.",
    },
  },
  createOnce(context) {
    let environment: TypeEnvironment | null = null;

    function reportFlow(
      expression: ESTree.Expression,
      target: WideningTarget | null,
      subject: string,
    ): void {
      if (
        target === null ||
        (isDictionaryAccumulator(target) && isEmptyObject(expression)) ||
        !hasKnownEvidence(context.sourceCode, expression)
      ) {
        return;
      }
      context.report({
        node: expression,
        messageId: "widening",
        data: { subject, target: target.kind },
      });
    }

    function targetFromAnnotation(
      annotation: ESTree.TSTypeAnnotation | null | undefined,
    ): WideningTarget | null {
      return environment === null ? null : annotationTarget(annotation, environment);
    }

    return {
      Program(node) {
        environment = createTypeEnvironment(node);
      },
      AccessorProperty(node) {
        if (node.value !== null) {
          reportFlow(
            node.value,
            targetFromAnnotation(node.typeAnnotation),
            `property \`${sourceKeyName(context.sourceCode, node.key)}\``,
          );
        }
      },
      ArrowFunctionExpression(node) {
        if (node.body.type !== "BlockStatement") {
          reportFlow(
            node.body,
            targetFromAnnotation(node.returnType),
            `return value of \`${functionName(context.sourceCode, node)}\``,
          );
        }
      },
      AssignmentExpression(node) {
        if (node.operator !== "=" || node.left.type !== "Identifier") {
          return;
        }
        const variable = resolveVariable(context.sourceCode, node.left);
        if (variable === null) {
          return;
        }
        const declarator = variableDeclarator(variable);
        if (declarator?.id.type === "Identifier") {
          reportFlow(
            node.right,
            targetFromAnnotation(declarator.id.typeAnnotation),
            `binding \`${declarator.id.name}\``,
          );
        }
      },
      PropertyDefinition(node) {
        if (node.value !== null) {
          reportFlow(
            node.value,
            targetFromAnnotation(node.typeAnnotation),
            `property \`${sourceKeyName(context.sourceCode, node.key)}\``,
          );
        }
      },
      ReturnStatement(node) {
        if (node.argument !== null) {
          const owner = enclosingFunction(node);
          reportFlow(
            node.argument,
            targetFromAnnotation(owner?.returnType),
            `return value of \`${functionName(context.sourceCode, owner)}\``,
          );
        }
      },
      TSAsExpression(node) {
        if (environment !== null && !hasParentAssertion(node)) {
          reportFlow(
            node.expression,
            classifyWideningTarget(node.typeAnnotation, environment),
            "assertion",
          );
        }
      },
      TSTypeAssertion(node) {
        if (environment !== null && !hasParentAssertion(node)) {
          reportFlow(
            node.expression,
            classifyWideningTarget(node.typeAnnotation, environment),
            "assertion",
          );
        }
      },
      VariableDeclarator(node) {
        if (node.init !== null && node.id.type === "Identifier") {
          reportFlow(
            node.init,
            targetFromAnnotation(node.id.typeAnnotation),
            `binding \`${node.id.name}\``,
          );
        }
      },
    };
  },
});

export default noKnownValueWidening;
