/**
 * @fileoverview Builds focused organization rules for conventionally named declaration files.
 *
 * Each generated rule validates one filename and one declaration family.
 * Schema files permit only Zod-derived aliases beside runtime schema constants.
 */
import { basename } from "node:path";

import { isAstNode } from "./ast-nodes.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import {
  collectZodImports,
  createZodImportState,
  qualifiedTypeName,
  unwrapExpression,
} from "./zod-ast.ts";

export type FileOrganizationKind = "constants" | "enum" | "errors" | "schemas" | "types";

const filenames = {
  constants: "constants",
  enum: "enums",
  errors: "errors",
  schemas: "schemas",
  types: "types",
} satisfies Record<FileOrganizationKind, string>;

function matchesFilename(filename: string, kind: FileOrganizationKind): boolean {
  return new RegExp(`^${filenames[kind]}\\.[cm]?[jt]sx?$`, "u").test(basename(filename));
}

function declarationOf(statement: AstNode): AstNode | undefined {
  if (
    statement.type === "ExportNamedDeclaration" ||
    statement.type === "ExportDefaultDeclaration"
  ) {
    return isAstNode(statement.declaration) ? statement.declaration : undefined;
  }
  return statement;
}

function isTypeOnlyImport(node: AstNode): boolean {
  if (node.importKind === "type") {
    return true;
  }
  return (
    (node.specifiers?.length ?? 0) > 0 &&
    (node.specifiers ?? []).every((specifier) => specifier.importKind === "type")
  );
}

function superclassName(node: AstNode | null | undefined): string | undefined {
  if (node?.type === "Identifier") {
    return node.name;
  }
  if (node?.type === "MemberExpression" && node.property?.type === "Identifier") {
    return node.property.name;
  }
  return undefined;
}

function isErrorClass(node: AstNode): boolean {
  return (
    node.type === "ClassDeclaration" &&
    (superclassName(node.superClass)?.endsWith("Error") ?? false)
  );
}

function isZodInferAlias(node: AstNode, roots: ReadonlySet<string>): boolean {
  if (node.type !== "TSTypeAliasDeclaration") {
    return false;
  }
  const annotation = unwrapExpression(node.typeAnnotation);
  const qualifiedName = qualifiedTypeName(annotation);
  const arguments_ = annotation?.typeArguments?.params ?? annotation?.typeParameters?.params ?? [];
  return (
    qualifiedName?.name === "infer" && roots.has(qualifiedName.namespace) && arguments_.length === 1
  );
}

function isAllowedDeclaration(
  kind: FileOrganizationKind,
  node: AstNode,
  zodRoots: ReadonlySet<string>,
): boolean {
  if (kind === "constants") {
    return node.type === "VariableDeclaration" && node.kind === "const";
  }
  if (kind === "enum") {
    return node.type === "TSEnumDeclaration";
  }
  if (kind === "errors") {
    return isErrorClass(node);
  }
  if (kind === "schemas") {
    return (
      (node.type === "VariableDeclaration" && node.kind === "const") ||
      isZodInferAlias(node, zodRoots)
    );
  }
  return (
    node.type === "TSInterfaceDeclaration" ||
    node.type === "TSTypeAliasDeclaration" ||
    node.type === "TSModuleDeclaration"
  );
}

/** Creates one rule that validates the declaration family for a dedicated filename. */
export function createFileOrganizationRule(kind: FileOrganizationKind): OxlintRule {
  return {
    meta: {
      type: "suggestion",
      docs: {
        description: `Keep ${filenames[kind]} files focused on their advertised declarations`,
      },
      messages: {
        runtimeImport:
          "A types file cannot use a runtime import. Use an explicit type-only import.",
        unexpected: `This ${filenames[kind]} file contains a declaration outside its advertised responsibility.`,
      },
      schema: [],
    },
    create(context) {
      if (!matchesFilename(context.filename, kind)) {
        return {};
      }

      return {
        Program(rawNode) {
          const program = rawNode as AstNode;
          const zod = createZodImportState();
          if (kind === "schemas") {
            collectZodImports(program, zod);
          }

          const statements = Array.isArray(program.body) ? program.body : [];
          for (const statement of statements) {
            if (statement.type === "ImportDeclaration") {
              if (kind === "types" && !isTypeOnlyImport(statement) && statement.loc) {
                context.report({ loc: statement.loc, messageId: "runtimeImport" });
              }
              continue;
            }

            if (statement.type === "ExportAllDeclaration") {
              continue;
            }

            const declaration = declarationOf(statement);
            if (!declaration || declaration.type === "EmptyStatement") {
              continue;
            }

            if (!isAllowedDeclaration(kind, declaration, zod.roots) && declaration.loc) {
              context.report({ loc: declaration.loc, messageId: "unexpected" });
            }
          }
        },
      };
    },
  };
}
