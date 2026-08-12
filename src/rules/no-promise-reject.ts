/**
 * Disallows Promise.reject because asynchronous expected failures must resolve to Result.err.
 *
 * Flags: `Promise.reject(error)` and `new Promise((resolve, reject) => reject(error))`
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  astSubtreeSome,
  isFunctionNode,
  memberName,
  propertyName,
  unwrapExpression,
} from "./zod-ast.ts";

function rejectsFromExecutor(node: AstNode): boolean {
  const callee = unwrapExpression(node.callee);
  const executor = unwrapExpression(node.arguments?.[0]);
  if (
    node.type !== "NewExpression" ||
    callee?.type !== "Identifier" ||
    callee.name !== "Promise" ||
    !isFunctionNode(executor)
  ) {
    return false;
  }

  const rejectName = propertyName(executor.params?.[1]);
  if (!rejectName) {
    return false;
  }
  const body = Array.isArray(executor.body) ? undefined : executor.body;
  return astSubtreeSome(body, (candidate) => {
    const target = unwrapExpression(candidate.callee);
    return (
      candidate.type === "CallExpression" &&
      target?.type === "Identifier" &&
      target.name === rejectName
    );
  });
}

const noPromiseReject = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow explicit Promise rejection",
    },
    messages: {
      forbidden:
        "Do not reject a Promise. Resolve to Result.err(...) for an expected failure, or use panic(...) for a defect.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        const callee = unwrapExpression(node.callee);
        const object = unwrapExpression(callee?.object);
        if (
          callee?.type === "MemberExpression" &&
          object?.type === "Identifier" &&
          object.name === "Promise" &&
          memberName(callee) === "reject"
        ) {
          context.report({ node: rawNode, messageId: "forbidden" });
        }
      },
      NewExpression(rawNode) {
        if (rejectsFromExecutor(rawNode as AstNode)) {
          context.report({ node: rawNode, messageId: "forbidden" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default noPromiseReject;
