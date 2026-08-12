/**
 * Detects `schema.safeParse(JSON.parse(text))`. Malformed JSON throws before `safeParse` can return
 * a failed Zod result.
 *
 * Flags: `schema.safeParse(JSON.parse(text))`
 *
 * Does not flag: calls inside `try` blocks or compile-time string literals that contain valid JSON.
 */
import { astNodes } from "./ast-nodes.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import {
  createZodImportState,
  isIdentifierMember,
  isInsideTryBlock,
  isMethodCall,
  unwrapExpression,
  zodImportVisitor,
} from "./zod-ast.ts";

function isJsonParse(node: AstNode | null | undefined): boolean {
  const current = unwrapExpression(node);
  return current?.type === "CallExpression" && isIdentifierMember(current.callee, "JSON", "parse");
}

function parsesKnownValidJson(node: AstNode | null | undefined): boolean {
  const current = unwrapExpression(node);
  const input = unwrapExpression(current?.arguments?.[0]);
  const constructor = (input?.value as { constructor?: unknown } | null)?.constructor;
  if (input?.type !== "Literal" || constructor !== String) {
    return false;
  }
  try {
    JSON.parse(input.value as string);
    return true;
  } catch {
    return false;
  }
}

const jsonParseArgumentOfSafeparse = {
  meta: {
    type: "problem",
    docs: {
      description: "Keep JSON.parse failures inside Zod's safe parsing contract",
    },
    messages: {
      codec:
        "safeParse cannot catch JSON.parse while its argument is evaluated. Parse at the I/O boundary, preserve failure explicitly, then validate the successful value.",
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
          zod.roots.size === 0 ||
          !isMethodCall(node, "safeParse") ||
          !isJsonParse(node.arguments?.[0]) ||
          parsesKnownValidJson(node.arguments?.[0])
        ) {
          return;
        }

        const ancestors = astNodes(context.sourceCode.getAncestors(rawNode));
        if (!isInsideTryBlock(ancestors)) {
          context.report({ node: rawNode, messageId: "codec" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default jsonParseArgumentOfSafeparse;
