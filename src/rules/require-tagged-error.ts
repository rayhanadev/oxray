/**
 * Requires structured tagged errors for Result failures and domain error declarations.
 *
 * Flags: `Result.err("missing")` and `class Missing extends Error {}`
 */
import {
  betterResultImportVisitor,
  createBetterResultImportState,
  isResultStaticCall,
  isTaggedErrorSuperclass,
} from "./better-result-ast.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import { unwrapExpression } from "./zod-ast.ts";

const nativeErrors = new Set([
  "AggregateError",
  "Error",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);

function isNativeErrorConstruction(node: AstNode | null | undefined): boolean {
  const current = unwrapExpression(node);
  const callee = unwrapExpression(current?.callee);
  return (
    current?.type === "NewExpression" &&
    callee?.type === "Identifier" &&
    nativeErrors.has(callee.name ?? "")
  );
}

function isPrimitiveError(node: AstNode | null | undefined): boolean {
  const current = unwrapExpression(node);
  return (
    current?.type === "Literal" ||
    current?.type === "TemplateLiteral" ||
    (current?.type === "Identifier" && current.name === "undefined") ||
    isNativeErrorConstruction(current)
  );
}

const requireTaggedError = {
  meta: {
    type: "problem",
    docs: {
      description: "Require TaggedError for expected failures",
    },
    messages: {
      result:
        "Result.err(...) requires a structured TaggedError. Use panic(...) when the condition is a defect.",
      returnValue: "Do not return a native Error value. Return Result.err(...) with a TaggedError.",
      superclass: "Domain errors must extend TaggedError instead of a native Error class.",
    },
    schema: [],
  },
  create(context) {
    const betterResult = createBetterResultImportState();

    function inspectClass(rawNode: unknown): void {
      const node = rawNode as AstNode;
      const superclass = unwrapExpression(node.superClass);
      if (
        isTaggedErrorSuperclass(superclass, betterResult) ||
        superclass?.type !== "Identifier" ||
        !nativeErrors.has(superclass.name ?? "")
      ) {
        return;
      }
      context.report({ node: rawNode as never, messageId: "superclass" });
    }

    return {
      ...betterResultImportVisitor(betterResult),
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (
          isResultStaticCall(node, "err", betterResult) &&
          isPrimitiveError(node.arguments?.[0])
        ) {
          context.report({ node: rawNode, messageId: "result" });
        }
      },
      ClassDeclaration: inspectClass,
      ClassExpression: inspectClass,
      ReturnStatement(rawNode) {
        const node = rawNode as AstNode;
        if (isNativeErrorConstruction(node.argument)) {
          context.report({ node: rawNode, messageId: "returnValue" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default requireTaggedError;
