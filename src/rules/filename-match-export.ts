/**
 * Matches a module's filename to its named default export.
 *
 * The comparison ignores case and separators. It accepts `user-client.ts` for `UserClient`.
 * The rule excludes index, test, specification, story, and declaration files.
 */
import { basename } from "node:path";

import { isAstNode, unwrapTypeScriptExpression } from "./ast-nodes.ts";
import type { AstNode, OxlintRule } from "./types.ts";

function moduleStem(filename: string): string {
  return basename(filename).replace(/\.[cm]?[jt]sx?$/u, "");
}

function normalizedName(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9]/gu, "").toLowerCase();
}

function kebabCase(value: string): string {
  return value
    .replaceAll(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replaceAll(/([A-Z])([A-Z][a-z])/gu, "$1-$2")
    .toLowerCase();
}

function defaultExportName(statement: AstNode): string | undefined {
  const declaration = unwrapTypeScriptExpression(
    isAstNode(statement.declaration) ? statement.declaration : undefined,
  );
  if (declaration?.type === "Identifier") {
    return declaration.name;
  }
  if (
    (declaration?.type === "FunctionDeclaration" || declaration?.type === "ClassDeclaration") &&
    declaration.id?.type === "Identifier"
  ) {
    return declaration.id.name;
  }
  return undefined;
}

function isExcludedFile(filename: string): boolean {
  const name = basename(filename);
  return (
    /^index\.[cm]?[jt]sx?$/u.test(name) ||
    /\.d\.[cm]?[jt]s$/u.test(name) ||
    /\.(?:spec|stories|test)\.[cm]?[jt]sx?$/u.test(name)
  );
}

const filenameMatchExport = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require named default exports to match their filenames",
    },
    messages: {
      mismatch:
        'The default export "{{name}}" does not match "{{filename}}". Rename the file to "{{expected}}", or rename the export.',
    },
    schema: [],
  },
  create(context) {
    if (isExcludedFile(context.filename)) {
      return {};
    }

    return {
      ExportDefaultDeclaration(rawNode) {
        const statement = rawNode as AstNode;
        const name = defaultExportName(statement);
        const stem = moduleStem(context.filename);
        if (!name || normalizedName(name) === normalizedName(stem) || !statement.loc) {
          return;
        }
        const extension = /\.[cm]?[jt]sx?$/u.exec(basename(context.filename))?.[0] ?? "";
        context.report({
          loc: statement.loc,
          messageId: "mismatch",
          data: {
            expected: `${kebabCase(name)}${extension}`,
            filename: basename(context.filename),
            name,
          },
        });
      },
    };
  },
} satisfies OxlintRule;

export default filenameMatchExport;
