/**
 * Detects deprecated Zod 3 string-format methods on chains rooted at `z.string()`, because Zod 4
 * exposes formats as top-level schemas with clearer intent and first-class format metadata.
 *
 * Flags: `z.string().url()`, `z.string().email()`, and `z.string().datetime()`
 *
 * Does not flag: `z.url()`, `z.email()`, or `z.iso.datetime()`. The rule never suggests `z.httpUrl()`,
 * which rejects localhost and IP-literal HTTP endpoints.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import { isMethodCall, zodRootConstructor } from "./zod-ast.ts";

const replacements = {
  base64: "z.base64()",
  base64url: "z.base64url()",
  cidrv4: "z.cidrv4()",
  cidrv6: "z.cidrv6()",
  cuid: "z.cuid2()",
  cuid2: "z.cuid2()",
  date: "z.iso.date()",
  datetime: "z.iso.datetime()",
  duration: "z.iso.duration()",
  e164: "z.e164()",
  email: "z.email()",
  emoji: "z.emoji()",
  guid: "z.guid()",
  ipv4: "z.ipv4()",
  ipv6: "z.ipv6()",
  jwt: "z.jwt()",
  ksuid: "z.ksuid()",
  nanoid: "z.nanoid()",
  time: "z.iso.time()",
  ulid: "z.ulid()",
  url: "z.url()",
  uuid: "z.uuid()",
  uuidv4: "z.uuid()",
  uuidv6: "z.uuid()",
  uuidv7: "z.uuid()",
  xid: "z.xid()",
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
    return {
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        if (zodRootConstructor(node) !== "string") {
          return;
        }

        for (const [method, replacement] of Object.entries(replacements)) {
          if (isMethodCall(node, method)) {
            context.report({
              node: rawNode,
              messageId: "deprecated",
              data: { method, replacement },
            });
            return;
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default zod3StringFormatMethod;
