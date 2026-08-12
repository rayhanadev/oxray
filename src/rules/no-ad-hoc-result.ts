/**
 * @fileoverview Detects paired hand-written result envelopes within one function.
 *
 * The rule compares success and error branches before reporting. An isolated transport object does
 * not establish an alternate result contract.
 *
 * Flags: `{ ok: true, value }` paired with `{ ok: false, error }`
 */
import { isAstNode } from "./ast-nodes.ts";
import { collectFunctionReturns, expandReturnBranches } from "./function-returns.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import { propertyName, unwrapExpression } from "./zod-ast.ts";

type EnvelopeBranch = "error" | "ok";
type EnvelopeFamily = "ok" | "status" | "success" | "tuple";

interface Envelope {
  branch: EnvelopeBranch;
  family: EnvelopeFamily;
  node: AstNode;
}

function literalProperty(object: AstNode, name: string): AstNode | undefined {
  const property = (object.properties ?? []).find(
    (candidate) => candidate.type === "Property" && propertyName(candidate.key) === name,
  );
  const value = property?.value;
  return isAstNode(value) ? unwrapExpression(value) : undefined;
}

function hasProperty(object: AstNode, name: string): boolean {
  return (object.properties ?? []).some(
    (property) => property.type === "Property" && propertyName(property.key) === name,
  );
}

function isBooleanLiteral(node: AstNode | null | undefined): node is AstNode {
  const current = unwrapExpression(node);
  const constructor = (current?.value as { constructor?: unknown } | null)?.constructor;
  return current?.type === "Literal" && constructor === Boolean;
}

function classifyObject(node: AstNode): Envelope | undefined {
  const ok = literalProperty(node, "ok");
  if (isBooleanLiteral(ok)) {
    const branch = ok.value ? "ok" : "error";
    const payload = branch === "ok" ? "value" : "error";
    return hasProperty(node, payload) ? { branch, family: "ok", node } : undefined;
  }

  const success = literalProperty(node, "success");
  if (isBooleanLiteral(success)) {
    const branch = success.value ? "ok" : "error";
    const payload = branch === "ok" ? "data" : "error";
    return hasProperty(node, payload) ? { branch, family: "success", node } : undefined;
  }

  const status = literalProperty(node, "status");
  if (status?.type === "Literal" && (status.value === "ok" || status.value === "error")) {
    const branch = status.value === "ok" ? "ok" : "error";
    const payload = branch === "ok" ? "value" : "error";
    return hasProperty(node, payload) ? { branch, family: "status", node } : undefined;
  }
  return undefined;
}

function isNull(node: AstNode | null | undefined): boolean {
  const current = unwrapExpression(node);
  return current?.type === "Literal" && current.value === null;
}

function classifyEnvelope(node: AstNode | null | undefined): Envelope | undefined {
  const current = unwrapExpression(node);
  if (current?.type === "ObjectExpression") {
    return classifyObject(current);
  }
  if (current?.type !== "ArrayExpression" || current.elements?.length !== 2) {
    return undefined;
  }

  const first = current.elements[0];
  const second = current.elements[1];
  if (!isNull(first) && isNull(second)) {
    return { branch: "ok", family: "tuple", node: current };
  }
  if (isNull(first) && !isNull(second)) {
    return { branch: "error", family: "tuple", node: current };
  }
  return undefined;
}

const noAdHocResult = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow hand-written result envelopes",
    },
    messages: {
      forbidden:
        "Do not return a hand-written result envelope. Use Result.ok(...) and Result.err(...).",
    },
    schema: [],
  },
  create(context) {
    function inspectFunction(rawNode: unknown): void {
      const envelopes = collectFunctionReturns(rawNode as AstNode)
        .flatMap(expandReturnBranches)
        .map((entry) => classifyEnvelope(entry.value))
        .filter((entry): entry is Envelope => entry !== undefined);

      for (const family of ["ok", "status", "success", "tuple"] as const) {
        const familyEntries = envelopes.filter((entry) => entry.family === family);
        if (
          !familyEntries.some((entry) => entry.branch === "ok") ||
          !familyEntries.some((entry) => entry.branch === "error")
        ) {
          continue;
        }
        for (const entry of familyEntries) {
          context.report({ node: entry.node as never, messageId: "forbidden" });
        }
      }
    }

    return {
      ArrowFunctionExpression: inspectFunction,
      FunctionDeclaration: inspectFunction,
      FunctionExpression: inspectFunction,
    };
  },
} satisfies OxlintRule;

export default noAdHocResult;
