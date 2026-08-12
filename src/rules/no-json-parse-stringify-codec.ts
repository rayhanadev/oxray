/**
 * @fileoverview Keeps generic JSON transport operations outside Zod codecs.
 *
 * Parsing and serialization belong at I/O boundaries. A Zod codec must model a domain-specific
 * representation instead of hiding generic JSON transport operations in a schema.
 *
 * Flags: a `z.codec()` that pairs `JSON.parse` and `JSON.stringify` across its callbacks.
 *
 * Does not flag: codecs with domain-specific inverse operations or standalone JSON operations.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  astSubtreeSome,
  createZodImportState,
  isDirectZodCall,
  isIdentifierMember,
  propertyName,
  unwrapExpression,
  zodImportVisitor,
} from "./zod-ast.ts";

function objectPropertyValue(node: AstNode | null | undefined, name: string): AstNode | undefined {
  const current = unwrapExpression(node);
  if (current?.type !== "ObjectExpression") {
    return undefined;
  }

  const property = (current.properties ?? []).find(
    (candidate) => candidate.type === "Property" && propertyName(candidate.key) === name,
  );
  return unwrapExpression(property?.value as AstNode | undefined);
}

function isJsonMember(node: AstNode | null | undefined, method: "parse" | "stringify"): boolean {
  return isIdentifierMember(node, "JSON", method);
}

function usesJsonMethod(node: AstNode | null | undefined, method: "parse" | "stringify"): boolean {
  const current = unwrapExpression(node);
  return (
    isJsonMember(current, method) ||
    astSubtreeSome(
      current,
      (candidate) => candidate.type === "CallExpression" && isJsonMember(candidate.callee, method),
    )
  );
}

const noJsonParseStringifyCodec = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow JSON parse/stringify pairs in Zod codecs",
    },
    messages: {
      transport:
        "JSON parsing and serialization are boundary I/O, not a domain codec. Validate the parsed value with a concrete schema.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (!isDirectZodCall(node, "codec", zod.roots)) {
          return;
        }

        const callbacks = node.arguments?.[2];
        const decode = objectPropertyValue(callbacks, "decode");
        const encode = objectPropertyValue(callbacks, "encode");
        const parsesThenStringifies =
          usesJsonMethod(decode, "parse") && usesJsonMethod(encode, "stringify");
        const stringifiesThenParses =
          usesJsonMethod(decode, "stringify") && usesJsonMethod(encode, "parse");
        if (parsesThenStringifies || stringifiesThenParses) {
          context.report({ node: rawNode, messageId: "transport" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default noJsonParseStringifyCodec;
