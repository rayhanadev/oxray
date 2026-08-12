/**
 * Detects `schema.safeParse(JSON.parse(text))`. Malformed JSON throws before `safeParse` can return
 * a failed Zod result.
 *
 * Flags: `schema.safeParse(JSON.parse(text))`
 *
 * Does not flag: calls inside `Result.try` or compile-time string literals that contain valid JSON.
 */
import { parse, type ParseError } from "jsonc-parser";

import { astNodes } from "./ast-nodes.ts";
import {
  collectBetterResultImports,
  createBetterResultImportState,
  enclosingResultBoundaryMethod,
} from "./better-result-ast.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import {
  collectZodImports,
  createZodImportState,
  isIdentifierMember,
  isMethodCall,
  unwrapExpression,
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
  const errors: ParseError[] = [];
  parse(input.value as string, errors, { allowTrailingComma: false, disallowComments: true });
  return errors.length === 0;
}

const jsonParseArgumentOfSafeparse = {
  meta: {
    type: "problem",
    docs: {
      description: "Keep JSON.parse failures inside Zod's safe parsing contract",
    },
    messages: {
      codec:
        "safeParse cannot catch JSON.parse while its argument is evaluated. Capture JSON.parse with Result.try and validate only the successful value.",
    },
    schema: [],
  },
  create(context) {
    const betterResult = createBetterResultImportState();
    const zod = createZodImportState();
    return {
      Program(rawNode) {
        const node = rawNode as AstNode;
        collectBetterResultImports(node, betterResult);
        collectZodImports(node, zod);
      },
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
        if (enclosingResultBoundaryMethod(ancestors, betterResult) === undefined) {
          context.report({ node: rawNode, messageId: "codec" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default jsonParseArgumentOfSafeparse;
