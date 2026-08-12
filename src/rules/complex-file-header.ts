/**
 * @fileoverview Enforces architectural overviews for modules with broad structure.
 *
 * Detects structurally complex modules that have no JSDoc file overview. A short header gives readers
 * the module boundary and control-flow map before they inspect a broad API or many execution paths.
 *
 * @example
 * export const first = () => condition ? left() : right();
 *
 * The rule does not flag declaration files, pure barrels, or modules with a structural score below
 * 30. It never uses line count.
 */
import { asCommentSource, isJSDocComment, walkAst } from "../analysis/comments.ts";
import { getControlFlow } from "../analysis/control-flow.ts";
import type { AstNode, OxlintRule } from "./types.ts";

const declarationTypes = new Set([
  "ClassDeclaration",
  "EnumDeclaration",
  "FunctionDeclaration",
  "TSDeclareFunction",
  "TSEnumDeclaration",
  "TSInterfaceDeclaration",
  "TSModuleDeclaration",
  "TSTypeAliasDeclaration",
]);
const functionTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
]);

function patternBindings(pattern: AstNode | null | undefined): number {
  if (!pattern) {
    return 0;
  }
  if (pattern.type === "Identifier") {
    return 1;
  }
  if (pattern.type === "RestElement") {
    return patternBindings(pattern.argument);
  }
  if (pattern.type === "AssignmentPattern") {
    return patternBindings(pattern.left);
  }
  if (pattern.type === "ArrayPattern") {
    return (pattern.elements ?? []).reduce((count, item) => count + patternBindings(item), 0);
  }
  if (pattern.type === "ObjectPattern") {
    return (pattern.properties ?? []).reduce(
      (count, property) =>
        count +
        patternBindings(
          property.type === "Property" ? (property.value as AstNode) : property.argument,
        ),
      0,
    );
  }
  return 0;
}

function declarationWidth(declaration: AstNode | null | undefined): number {
  if (!declaration) {
    return 0;
  }
  if (declaration.type === "VariableDeclaration") {
    return (declaration.declarations ?? []).reduce(
      (count, item) => count + patternBindings(item.id),
      0,
    );
  }
  return declarationTypes.has(declaration.type) ? 1 : 0;
}

function exportWidth(statement: AstNode): number {
  if (statement.type === "ExportDefaultDeclaration") {
    return 1;
  }
  if (statement.type === "ExportAllDeclaration") {
    return 1;
  }
  if (statement.type === "ExportNamedDeclaration") {
    return declarationWidth(statement.declaration) + (statement.specifiers?.length ?? 0);
  }
  return 0;
}

function isPureBarrel(program: AstNode): boolean {
  const statements = Array.isArray(program.body) ? program.body : [];
  return (
    statements.length > 0 &&
    statements.every(
      (statement) =>
        statement.type === "ImportDeclaration" ||
        statement.type === "ExportAllDeclaration" ||
        (statement.type === "ExportNamedDeclaration" && !statement.declaration),
    )
  );
}

const complexFileHeader = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require a file overview for structurally complex modules",
    },
    messages: {
      missing:
        "Add a leading `@fileoverview`. Structural score {{score}} = {{exports}} export points + {{declarations}} declarations + {{decisions}} control-flow points.",
    },
    schema: [],
  },
  create(context) {
    const sourceCode = asCommentSource(context.sourceCode);
    return {
      Program(rawNode) {
        const program = rawNode as AstNode;
        if (context.filename.endsWith(".d.ts") || isPureBarrel(program)) {
          return;
        }
        const statements = Array.isArray(program.body) ? program.body : [];
        const exportedSymbols = statements.reduce(
          (count, statement) => count + exportWidth(statement),
          0,
        );
        const declarations = statements.reduce((count, statement) => {
          const declaration =
            statement.type === "ExportNamedDeclaration" ||
            statement.type === "ExportDefaultDeclaration"
              ? statement.declaration
              : statement;
          return count + declarationWidth(declaration);
        }, 0);
        const controlFlow = getControlFlow(program, sourceCode.visitorKeys);
        let decisionPoints = 0;
        const owners = new Set<AstNode>([program]);
        walkAst(program, sourceCode.visitorKeys, (node) => {
          if (functionTypes.has(node.type)) {
            owners.add(node);
          }
        });
        for (const owner of owners) {
          const graph = controlFlow.cfgFor(owner);
          if (graph) {
            decisionPoints += Math.max(0, graph.cyclomaticComplexity - 1);
          }
        }
        const exportPoints = exportedSymbols * 2;
        const score = exportPoints + declarations + decisionPoints;
        if (score < 30) {
          return;
        }
        const firstStatementStart = statements[0]?.start ?? sourceCode.text.length;
        const hasHeader = sourceCode
          .getAllComments()
          .some(
            (comment) =>
              comment.start < firstStatementStart &&
              isJSDocComment(comment) &&
              /@fileoverview\b/iu.test(comment.value),
          );
        if (!hasHeader) {
          context.report({
            loc: program.loc!,
            messageId: "missing",
            data: {
              declarations: String(declarations),
              decisions: String(decisionPoints),
              exports: String(exportPoints),
              score: String(score),
            },
          });
        }
      },
    };
  },
} satisfies OxlintRule;

export default complexFileHeader;
