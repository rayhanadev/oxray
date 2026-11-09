/** Rejects unconditional Bun test skips because skipped coverage cannot detect regressions. */
import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

const testNames = new Set(["test", "it", "describe"]);

function propertyName(node: ESTree.MemberExpression): string | null {
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  return node.property.type === "Literal" ? String(node.property.value) : null;
}

function isBunTest(
  sourceCode: SourceCode,
  identifier: ESTree.IdentifierReference,
  members: readonly string[],
): boolean {
  let scope: Scope | null = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      return variable.defs.some((definition) => {
        const specifier = definition.node;
        if (
          definition.type !== "ImportBinding" ||
          specifier.parent?.type !== "ImportDeclaration" ||
          specifier.parent.source.value !== "bun:test" ||
          specifier.parent.importKind === "type"
        ) {
          return false;
        }
        if (specifier.type === "ImportNamespaceSpecifier") {
          return testNames.has(members[0] ?? "") && members.slice(1).includes("skip");
        }
        if (specifier.type !== "ImportSpecifier" || specifier.importKind === "type") {
          return false;
        }
        const imported = specifier.imported;
        const name = imported.type === "Identifier" ? imported.name : imported.value;
        return testNames.has(name) && members.includes("skip");
      });
    }
    scope = scope.upper;
  }
  return false;
}

const noDisabledBunTests = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Reject unconditional skips on imported Bun tests and suites" },
    messages: {
      disabled:
        "This Bun test or suite is skipped. Restore its coverage or remove the obsolete test.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        let callee = node.callee;
        const members: string[] = [];
        while (callee.type === "MemberExpression") {
          const name = propertyName(callee);
          if (name === null || callee.object.type === "Super") {
            return;
          }
          members.unshift(name);
          callee = callee.object;
        }
        if (callee.type === "Identifier" && isBunTest(context.sourceCode, callee, members)) {
          context.report({ node, messageId: "disabled" });
        }
      },
    };
  },
});

export default noDisabledBunTests;
