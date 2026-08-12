/**
 * @fileoverview Requires exported functions to use declarations.
 *
 * The rule checks direct, default, and local specifier exports.
 * It permits callback wrappers when the exported value is a call result.
 */
import { isAstNode, unwrapTypeScriptExpression } from "./ast-nodes.ts";
import type { AstNode, OxlintRule } from "./types.ts";

function isFunctionExpression(node: AstNode | null | undefined): boolean {
  const expression = unwrapTypeScriptExpression(node);
  return (
    expression?.type === "ArrowFunctionExpression" || expression?.type === "FunctionExpression"
  );
}

function variableDeclarationOf(statement: AstNode): AstNode | undefined {
  if (statement.type === "VariableDeclaration") {
    return statement;
  }
  if (statement.type === "ExportNamedDeclaration" && isAstNode(statement.declaration)) {
    return statement.declaration.type === "VariableDeclaration" ? statement.declaration : undefined;
  }
  return undefined;
}

function functionBindings(program: AstNode): Map<string, AstNode> {
  const bindings = new Map<string, AstNode>();
  const statements = Array.isArray(program.body) ? program.body : [];
  for (const statement of statements) {
    const declaration = variableDeclarationOf(statement);
    for (const declarator of declaration?.declarations ?? []) {
      if (
        declarator.id?.type === "Identifier" &&
        declarator.id.name &&
        isFunctionExpression(declarator.init)
      ) {
        bindings.set(declarator.id.name, declarator.id);
      }
    }
  }
  return bindings;
}

const noExportedFunctionExpressions = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require exported functions to use function declarations",
    },
    messages: {
      declaration:
        "Exported function expressions hide declaration semantics. Use a function declaration instead.",
    },
    schema: [],
  },
  create(context) {
    return {
      Program(rawNode) {
        const program = rawNode as AstNode;
        const bindings = functionBindings(program);
        const reported = new Set<AstNode>();

        function report(node: AstNode | undefined): void {
          if (!node?.loc || reported.has(node)) {
            return;
          }
          reported.add(node);
          context.report({ loc: node.loc, messageId: "declaration" });
        }

        const statements = Array.isArray(program.body) ? program.body : [];
        for (const statement of statements) {
          if (statement.type === "ExportNamedDeclaration") {
            const declaration = variableDeclarationOf(statement);
            for (const declarator of declaration?.declarations ?? []) {
              if (isFunctionExpression(declarator.init)) {
                report(declarator.id ?? undefined);
              }
            }

            if (!statement.source) {
              for (const specifier of statement.specifiers ?? []) {
                if (specifier.local?.type === "Identifier" && specifier.local.name) {
                  report(bindings.get(specifier.local.name));
                }
              }
            }
            continue;
          }

          if (statement.type !== "ExportDefaultDeclaration") {
            continue;
          }

          const declaration = isAstNode(statement.declaration) ? statement.declaration : undefined;
          if (isFunctionExpression(declaration)) {
            report(declaration);
            continue;
          }

          const unwrapped = unwrapTypeScriptExpression(declaration);
          if (unwrapped?.type === "Identifier" && unwrapped.name) {
            report(bindings.get(unwrapped.name));
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default noExportedFunctionExpressions;
