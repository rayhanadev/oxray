/**
 * Detects `z.number()` on high-confidence integer-like keys inside `defineTool` and
 * `defineDomainTool` inputs, because identifiers, counts, page sizes, and record numbers should emit
 * `type: "integer"` to the model and reject fractional values at runtime.
 *
 * Flags: `defineTool({ input: z.strictObject({ pull_number: z.number() }) })`
 *
 * Does not flag: `pull_number: z.int()`, fractional fields such as `price: z.number()`, or number
 * fields in provider response schemas outside a tool input.
 */
import type { AstNode, OxlintRule } from "./types.ts";
import {
  chainHasMethod,
  createZodImportState,
  isToolInputProperty,
  propertyName,
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
    messages: {
      integer:
        "This tool input field is integer-shaped. Use z.int() so runtime validation and model-facing JSON Schema agree.",
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
          context.report({ node: rawNode, messageId: "integer" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default toolInputIntegerAsNumber;
