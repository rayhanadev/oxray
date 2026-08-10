/**
 * Detects unprotected throwing operations such as `new URL`, `JSON.parse`, `BigInt`,
 * `decodeURIComponent`, and `new RegExp` inside Zod refinement callbacks, because refinements must
 * return validation results rather than let exceptions escape even from `safeParse`.
 *
 * Flags: `z.string().refine((value) => new URL(value).protocol === "https:")`
 *
 * Does not flag: a throwing operation wrapped by `try/catch` inside the callback, or a guarded
 * `z.stringFormat()` predicate. A `try` around schema construction does not count as protection.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  calleeName,
  enclosingRefinementCall,
  isInsideTryBlock,
  memberName,
  unwrapExpression,
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

function isUnprotectedRefinement(ancestors: readonly AstNode[]): boolean {
  const refinement = enclosingRefinementCall(ancestors);
  if (!refinement) {
    return false;
  }
  const refinementIndex = ancestors.indexOf(refinement);
  return !isInsideTryBlock(ancestors.slice(refinementIndex + 1));
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
    return {
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (throwingGlobalCalls.has(calleeName(node.callee) ?? "") || isJsonParse(node)) {
          const ancestors = context.sourceCode.getAncestors(rawNode) as unknown as AstNode[];
          if (isUnprotectedRefinement(ancestors)) {
            context.report({ node: rawNode, messageId: "mustNotThrow" });
          }
        }
      },
      NewExpression(rawNode) {
        const node = rawNode as AstNode;
        if (throwingNewExpressions.has(calleeName(node.callee) ?? "")) {
          const ancestors = context.sourceCode.getAncestors(rawNode) as unknown as AstNode[];
          if (isUnprotectedRefinement(ancestors)) {
            context.report({ node: rawNode, messageId: "mustNotThrow" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default throwingZodRefine;
