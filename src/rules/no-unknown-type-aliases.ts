/**
 * Rejects aliases that rename `unknown` without adding a contract.
 *
 * Flags direct aliases and local alias chains.
 * Generic aliases remain valid because their type parameter can add useful structure.
 */
import type { AstNode, OxlintRule } from "./types.ts";

function referencedAliasName(node: AstNode | undefined): string | undefined {
  if (node?.type === "TSParenthesizedType") {
    return referencedAliasName(node.typeAnnotation);
  }
  if (
    node?.type !== "TSTypeReference" ||
    node.typeName?.type !== "Identifier" ||
    (node.typeArguments?.params?.length ?? 0) > 0
  ) {
    return undefined;
  }
  return node.typeName.name;
}

const noUnknownTypeAliases = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow aliases whose resolved type is unknown",
    },
    messages: {
      unknownAlias:
        "Type alias `{{alias}}` only renames unknown. Keep unknown visible at the boundary, or replace it with a parsed owner type.",
    },
    schema: [],
  },
  create(context) {
    return {
      Program(rawNode) {
        const program = rawNode as AstNode;
        const aliases = new Map<string, AstNode>();
        const statements = Array.isArray(program.body) ? program.body : [];

        for (const statement of statements) {
          const declaration =
            statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
          if (declaration?.type === "TSTypeAliasDeclaration" && declaration.id?.name) {
            aliases.set(declaration.id.name, declaration);
          }
        }

        function resolvesToUnknown(node: AstNode | undefined, visited: Set<string>): boolean {
          if (node?.type === "TSUnknownKeyword") {
            return true;
          }
          if (node?.type === "TSParenthesizedType") {
            return resolvesToUnknown(node.typeAnnotation, visited);
          }
          const name = referencedAliasName(node);
          if (!name || visited.has(name)) {
            return false;
          }
          const alias = aliases.get(name);
          if (!alias || (alias.typeParameters?.params?.length ?? 0) > 0) {
            return false;
          }
          visited.add(name);
          return resolvesToUnknown(alias.typeAnnotation, visited);
        }

        for (const [name, alias] of aliases) {
          if (resolvesToUnknown(alias.typeAnnotation, new Set([name])) && alias.id?.loc) {
            context.report({
              loc: alias.id.loc,
              messageId: "unknownAlias",
              data: { alias: name },
            });
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default noUnknownTypeAliases;
