/**
 * Detects unprotected throwing operations such as `new URL`, `JSON.parse`, `BigInt`,
 * `decodeURIComponent`, and `new RegExp` inside Zod refinement callbacks, because refinements must
 * return validation results rather than let exceptions escape even from `safeParse`.
 *
 * Flags: `z.string().refine((value) => new URL(value).protocol === "https:")`
 *
 * Does not flag: a throwing operation wrapped by `try/catch` inside the callback, `new URL` reached
 * only after an aborting URL-format check or fatal `URL.canParse` guard, or a guarded
 * `z.stringFormat()` predicate. A `try` around schema construction does not count as protection.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  astSubtreeSome,
  calleeName,
  createZodImportState,
  enclosingRefinementCall,
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
  const callee = unwrapExpression(node.callee);
  const object = unwrapExpression(callee?.object);
  return (
    callee?.type === "MemberExpression" &&
    object?.type === "Identifier" &&
    object.name === "JSON" &&
    memberName(callee) === "parse"
  );
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
    const callee = unwrapExpression(candidate.callee);
    const object = unwrapExpression(callee?.object);
    return (
      candidate.type === "CallExpression" &&
      callee?.type === "MemberExpression" &&
      object?.type === "Identifier" &&
      object.name === "URL" &&
      memberName(callee) === "canParse"
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

const throwingZodRefine = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow unprotected throwing operations in Zod refinements",
    },
    messages: {
      mustNotThrow:
        "Zod refinement callbacks must not throw. Guard this operation with try/catch or express it as an aborting schema check.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (
          zod.roots.size > 0 &&
          (throwingGlobalCalls.has(calleeName(node.callee) ?? "") || isJsonParse(node))
        ) {
          const ancestors = context.sourceCode.getAncestors(rawNode) as unknown as AstNode[];
          if (isUnprotectedRefinement(ancestors)) {
            context.report({ node: rawNode, messageId: "mustNotThrow" });
          }
        }
      },
      NewExpression(rawNode) {
        const node = rawNode as AstNode;
        if (zod.roots.size > 0 && throwingNewExpressions.has(calleeName(node.callee) ?? "")) {
          const ancestors = context.sourceCode.getAncestors(rawNode) as unknown as AstNode[];
          if (isUnprotectedRefinement(ancestors, calleeName(node.callee) === "URL")) {
            context.report({ node: rawNode, messageId: "mustNotThrow" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default throwingZodRefine;
