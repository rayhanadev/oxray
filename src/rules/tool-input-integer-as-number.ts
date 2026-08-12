/**
 * Detects `z.number()` on high-confidence integer keys inside tool inputs. Identifiers, counts,
 * page sizes, and record numbers should reject fractional values and emit `type: "integer"`.
 *
 * Flags: `defineTool({ input: z.strictObject({ pull_number: z.number() }) })`
 *
 * Does not flag: `pull_number: z.int()`, fractional fields such as `price: z.number()`, or number
 * fields in provider response schemas outside a tool input.
 */
import { correctionFromEdits, replaceNode } from "./corrections.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import {
  chainHasMethod,
  createZodImportState,
  isToolInputProperty,
  propertyName,
  unwrapExpression,
  zodRootCall,
  zodRootConstructor,
  zodImportVisitor,
} from "./zod-ast.ts";

const integerMethods = new Set(["int"]);
const integerField =
  /^(?:id|ids|limit|first|page|page_size|per_page|depth|count|offset|since|until|from|to|priority|quantity|position|milestone|frequency|duration|.*_id|.*_ids|.*_number|number)$/u;

const toolInputIntegerAsNumber = {
  meta: {
    type: "problem",
    docs: {
      description: "Use integer schemas for integer-like tool input fields",
    },
    hasSuggestions: true,
    messages: {
      integer:
        "This tool input field is integer-shaped. Use z.int() so runtime validation and model-facing JSON Schema agree.",
      integerWithSuggestion:
        "This integer-shaped tool field still accepts fractions. Replace it with `{{replacement}}` to reject fractions and emit an integer JSON Schema.",
      useInteger: "Replace this field schema with {{replacement}}.",
    },
    schema: [],
  },
  create(context) {
    const zod = createZodImportState();
    return {
      ...zodImportVisitor(zod),
      Property(rawNode) {
        const node = rawNode as AstNode;
        const key = propertyName(node.key);
        const value = node.value as AstNode | undefined;
        if (
          !key ||
          !value ||
          !integerField.test(key) ||
          zodRootConstructor(value, zod.roots) !== "number" ||
          chainHasMethod(value, integerMethods)
        ) {
          return;
        }

        const ancestors = context.sourceCode.getAncestors(rawNode) as unknown as AstNode[];
        const toolInput = ancestors.findLast(
          (ancestor) =>
            ancestor.type === "Property" &&
            isToolInputProperty(ancestor, ancestors.slice(0, ancestors.indexOf(ancestor))),
        );
        if (toolInput) {
          const root = zodRootCall(value, zod.roots);
          const callee = unwrapExpression(root?.callee);
          const correction = correctionFromEdits(context.sourceCode.text, value, [
            replaceNode(callee?.property, "int"),
          ]);
          if (correction) {
            context.report({
              node: rawNode,
              messageId: "integerWithSuggestion",
              data: { replacement: correction.replacement },
              suggest: [
                {
                  messageId: "useInteger",
                  data: { replacement: correction.replacement },
                  fix: correction.fix,
                },
              ],
            });
          } else {
            context.report({ node: rawNode, messageId: "integer" });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default toolInputIntegerAsNumber;
