/**
 * Detects unguarded `schema.safeParse(JSON.parse(text))`, because JavaScript evaluates `JSON.parse`
 * before calling `safeParse`, so malformed JSON throws a raw `SyntaxError` instead of returning a
 * failed Zod result.
 *
 * Flags: `schema.safeParse(JSON.parse(text))`
 *
 * Does not flag: the same call inside a `try` block, a compile-time string literal confirmed to be
 * valid JSON, or `jsonCodec(schema).safeParse(text)`.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  createZodImportState,
  isInsideTryBlock,
  isMethodCall,
  memberName,
  unwrapExpression,
  zodImportVisitor,
} from "./zod-ast.ts";

function isJsonParse(node: AstNode | null | undefined): boolean {
  const current = unwrapExpression(node);
  const callee = unwrapExpression(current?.callee);
  const object = unwrapExpression(callee?.object);
  return (
    current?.type === "CallExpression" &&
    callee?.type === "MemberExpression" &&
    object?.type === "Identifier" &&
    object.name === "JSON" &&
    memberName(callee) === "parse"
  );
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
        "safeParse cannot catch JSON.parse while its argument is being evaluated. Parse through a JSON codec instead.",
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

        const ancestors = context.sourceCode.getAncestors(rawNode) as unknown as AstNode[];
        if (!isInsideTryBlock(ancestors)) {
          context.report({ node: rawNode, messageId: "codec" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default jsonParseArgumentOfSafeparse;
