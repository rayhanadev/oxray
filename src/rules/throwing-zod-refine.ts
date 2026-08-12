/**
 * @fileoverview Prevents exceptions from escaping Zod refinement callbacks.
 *
 * Detects unprotected throwing operations inside Zod refinement callbacks. Refinements must return
 * validation results because an exception can escape even from `safeParse`.
 *
 * Flags: `z.string().refine((value) => new URL(value).protocol === "https:")`
 *
 * Does not flag: an operation inside a callback `try/catch` or after an aborting format check. It
 * also permits a guarded `z.stringFormat()` predicate. A `try` around schema construction does not
 * protect the callback.
 */
import { astNodes } from "./ast-nodes.ts";
import {
  correctionFromEdits,
  replaceNode,
  sourceTextForNode,
  type Correction,
} from "./corrections.ts";
import type { AstNode, OxlintReportNode, OxlintRule } from "./types.ts";
import {
  astSubtreeSome,
  calleeName,
  createZodImportState,
  enclosingRefinementCall,
  isIdentifierMember,
  isFunctionNode,
  isInsideTryBlock,
  memberName,
  methodReceiver,
  propertyName,
  unwrapExpression,
  zodImportVisitor,
} from "./zod-ast.ts";

const throwingGlobalCalls = new Set(["BigInt", "decodeURIComponent"]);
const throwingNewExpressions = new Set(["RegExp", "URL"]);

function isJsonParse(node: AstNode): boolean {
  return isIdentifierMember(node.callee, "JSON", "parse");
}

function objectHasTrueProperty(node: AstNode | null | undefined, name: string): boolean {
  const current = unwrapExpression(node);
  return (
    current?.type === "ObjectExpression" &&
    (current.properties ?? []).some(
      (property) =>
        property.type === "Property" &&
        propertyName(property.key) === name &&
        unwrapExpression(property.value as AstNode)?.value === true,
    )
  );
}

function hasFatalIssue(node: AstNode | null | undefined): boolean {
  return astSubtreeSome(node, (candidate) => {
    if (candidate.type !== "CallExpression" || memberName(candidate.callee) !== "addIssue") {
      return false;
    }
    return objectHasTrueProperty(candidate.arguments?.[0], "fatal");
  });
}

function hasUrlCanParseGuard(node: AstNode | null | undefined): boolean {
  return astSubtreeSome(node, (candidate) => {
    return (
      candidate.type === "CallExpression" && isIdentifierMember(candidate.callee, "URL", "canParse")
    );
  });
}

function hasEarlierAbortingUrlGuard(node: AstNode | null | undefined): boolean {
  const current = unwrapExpression(node);
  if (current?.type !== "CallExpression") {
    return false;
  }
  if (
    memberName(current.callee) === "url" &&
    (current.arguments ?? []).some((argument) => objectHasTrueProperty(argument, "abort"))
  ) {
    return true;
  }
  if (
    ["check", "refine", "superRefine"].includes(memberName(current.callee) ?? "") &&
    (current.arguments ?? []).some(
      (argument) => hasFatalIssue(argument) && hasUrlCanParseGuard(argument),
    )
  ) {
    return true;
  }
  return hasEarlierAbortingUrlGuard(methodReceiver(current));
}

function isUnprotectedRefinement(ancestors: readonly AstNode[], acceptsUrlGuard = false): boolean {
  const refinement = enclosingRefinementCall(ancestors);
  if (!refinement) {
    return false;
  }
  const refinementIndex = ancestors.indexOf(refinement);
  return (
    !isInsideTryBlock(ancestors.slice(refinementIndex + 1)) &&
    (!acceptsUrlGuard || !hasEarlierAbortingUrlGuard(methodReceiver(refinement)))
  );
}

function expressionRefinementCorrection(
  sourceText: string,
  ancestors: readonly AstNode[],
): Correction | undefined {
  const refinement = enclosingRefinementCall(ancestors);
  if (!refinement || memberName(refinement.callee) !== "refine") {
    return undefined;
  }

  const refinementIndex = ancestors.indexOf(refinement);
  const callback = ancestors
    .slice(refinementIndex + 1)
    .find((ancestor) => isFunctionNode(ancestor));
  const body = Array.isArray(callback?.body) ? undefined : callback?.body;
  if (callback?.type !== "ArrowFunctionExpression" || body?.type === "BlockStatement") {
    return undefined;
  }

  const bodyText = sourceTextForNode(sourceText, body);
  if (bodyText === undefined) {
    return undefined;
  }
  return correctionFromEdits(sourceText, callback, [
    replaceNode(body, `{ try { return ${bodyText}; } catch { return false; } }`),
  ]);
}

const throwingZodRefine = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow unprotected throwing operations in Zod refinements",
    },
    hasSuggestions: true,
    messages: {
      mustNotThrow:
        "This operation can throw outside Zod's safeParse contract. Catch it inside the refinement and return false, or establish an earlier aborting schema check.",
      mustNotThrowWithSuggestion:
        "This operation can throw outside Zod's safeParse contract. Replace the callback with `{{replacement}}` so an exception becomes a failed refinement.",
      wrapRefinement: "Catch exceptions inside this refinement callback.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    const report = (rawNode: OxlintReportNode, ancestors: readonly AstNode[]): void => {
      const correction = expressionRefinementCorrection(context.sourceCode.text, ancestors);
      if (correction) {
        context.report({
          node: rawNode,
          messageId: "mustNotThrowWithSuggestion",
          data: { replacement: correction.replacement },
          suggest: [{ messageId: "wrapRefinement", fix: correction.fix }],
        });
      } else {
        context.report({ node: rawNode, messageId: "mustNotThrow" });
      }
    };

    return {
      ...zodImportVisitor(zod),
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (
          zod.roots.size > 0 &&
          (throwingGlobalCalls.has(calleeName(node.callee) ?? "") || isJsonParse(node))
        ) {
          const ancestors = astNodes(context.sourceCode.getAncestors(rawNode));
          if (isUnprotectedRefinement(ancestors)) {
            report(rawNode, ancestors);
          }
        }
      },
      NewExpression(rawNode) {
        const node = rawNode as AstNode;
        if (zod.roots.size > 0 && throwingNewExpressions.has(calleeName(node.callee) ?? "")) {
          const ancestors = astNodes(context.sourceCode.getAncestors(rawNode));
          if (isUnprotectedRefinement(ancestors, calleeName(node.callee) === "URL")) {
            report(rawNode, ancestors);
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default throwingZodRefine;
