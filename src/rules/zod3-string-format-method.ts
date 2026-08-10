/**
 * Detects deprecated Zod 3 string-format methods on chains rooted at `z.string()`, because Zod 4
 * exposes formats as top-level schemas with clearer intent and first-class format metadata.
 *
 * Flags: `z.string().url()`, `z.string().email()`, and `z.string().datetime()`
 *
 * Does not flag: `z.url()`, code imported explicitly from `zod/v3`, or a chain such as
 * `z.string().trim().email()` whose pre-format operation makes a top-level-constructor rewrite
 * order-sensitive. The rule never suggests `z.httpUrl()`, and it preserves CUID and versioned UUID
 * formats exactly.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  createZodImportState,
  isDirectZodCall,
  isMethodCall,
  methodReceiver,
  zodRootConstructor,
  zodRootIdentifier,
  zodImportVisitor,
} from "./zod-ast.ts";

const replacements = {
  base64: "base64()",
  base64url: "base64url()",
  cidrv4: "cidrv4()",
  cidrv6: "cidrv6()",
  cuid: "cuid()",
  cuid2: "cuid2()",
  date: "iso.date()",
  datetime: "iso.datetime()",
  duration: "iso.duration()",
  e164: "e164()",
  email: "email()",
  emoji: "emoji()",
  guid: "guid()",
  ipv4: "ipv4()",
  ipv6: "ipv6()",
  jwt: "jwt()",
  ksuid: "ksuid()",
  nanoid: "nanoid()",
  time: "iso.time()",
  ulid: "ulid()",
  url: "url()",
  uuid: "uuid()",
  uuidv4: "uuidv4()",
  uuidv6: "uuidv6()",
  uuidv7: "uuidv7()",
  xid: "xid()",
} as const;

const zod3StringFormatMethod = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer Zod 4 top-level string format schemas",
    },
    messages: {
      deprecated:
        "Zod 4 deprecates z.string().{{method}}(). Start with {{replacement}} and then apply any remaining string checks.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (zodRootConstructor(node, zod.roots) !== "string") {
          return;
        }

        const root = zodRootIdentifier(node, zod.roots);
        if (!root) {
          return;
        }

        for (const [method, replacement] of Object.entries(replacements)) {
          if (
            isMethodCall(node, method) &&
            isDirectZodCall(methodReceiver(node), "string", zod.roots)
          ) {
            context.report({
              node: rawNode,
              messageId: "deprecated",
              data: { method, replacement: `${root}.${replacement}` },
            });
            return;
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default zod3StringFormatMethod;
