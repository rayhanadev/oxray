/**
 * @fileoverview Prevents exceptions from escaping Zod refinement callbacks.
 *
 * Detects unprotected throwing operations inside Zod refinement callbacks. Refinements must return
 * validation results because an exception can escape even from `safeParse`.
 *
 * Flags: `z.string().refine((value) => new URL(value).protocol === "https:")`
 *
 * Does not flag: an operation inside callback `Result.try` or after an aborting format check. It
 * also permits a guarded `z.stringFormat()` predicate. An outer boundary does not protect the
 * deferred callback.
 */
import { astNodes } from "./ast-nodes.ts";
import {
  collectBetterResultImports,
  createBetterResultImportState,
  enclosingResultBoundaryMethod,
  type BetterResultImportState,
} from "./better-result-ast.ts";
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
  collectZodImports,
  createZodImportState,
  enclosingRefinementCall,
  isIdentifierMember,
  isFunctionNode,
  memberName,
  methodReceiver,
  propertyName,
  unwrapExpression,
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

function isUnprotectedRefinement(
  ancestors: readonly AstNode[],
  betterResult: BetterResultImportState,
  acceptsUrlGuard = false,
): boolean {
  const refinement = enclosingRefinementCall(ancestors);
  if (!refinement) {
    return false;
  }
  return (
    enclosingResultBoundaryMethod(ancestors, betterResult) === undefined &&
    (!acceptsUrlGuard || !hasEarlierAbortingUrlGuard(methodReceiver(refinement)))
  );
}

function expressionRefinementCorrection(
  sourceText: string,
  ancestors: readonly AstNode[],
  betterResult: BetterResultImportState,
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
  const resultRoot =
    betterResult.results.size === 1 && betterResult.namespaces.size === 0
      ? [...betterResult.results][0]
      : betterResult.namespaces.size === 1 && betterResult.results.size === 0
        ? `${[...betterResult.namespaces][0]}.Result`
        : undefined;
  if (resultRoot === undefined) {
    return undefined;
  }
  return correctionFromEdits(sourceText, callback, [
    replaceNode(body, `${resultRoot}.try(() => ${bodyText}).unwrapOr(false)`),
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
        "Zod refinement callbacks must not throw. Use Result.try(...), a non-throwing guard, or an aborting schema check.",
      mustNotThrowWithSuggestion:
        "This operation can throw outside Zod's safeParse contract. Replace the callback with `{{replacement}}` so Result captures the exception.",
      wrapRefinement: "Capture this exception with Result.try(...).",
    },
    schema: [],
  },
  create(context) {
    const betterResult = createBetterResultImportState();
    const zod = createZodImportState();
    const report = (rawNode: OxlintReportNode, ancestors: readonly AstNode[]): void => {
      const correction = expressionRefinementCorrection(
        context.sourceCode.text,
        ancestors,
        betterResult,
      );
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
      Program(rawNode) {
        const node = rawNode as AstNode;
        collectBetterResultImports(node, betterResult);
        collectZodImports(node, zod);
      },
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (
          zod.roots.size > 0 &&
          (throwingGlobalCalls.has(calleeName(node.callee) ?? "") || isJsonParse(node))
        ) {
          const ancestors = astNodes(context.sourceCode.getAncestors(rawNode));
          if (isUnprotectedRefinement(ancestors, betterResult)) {
            report(rawNode, ancestors);
          }
        }
      },
      NewExpression(rawNode) {
        const node = rawNode as AstNode;
        if (zod.roots.size > 0 && throwingNewExpressions.has(calleeName(node.callee) ?? "")) {
          const ancestors = astNodes(context.sourceCode.getAncestors(rawNode));
          if (isUnprotectedRefinement(ancestors, betterResult, calleeName(node.callee) === "URL")) {
            report(rawNode, ancestors);
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default throwingZodRefine;
