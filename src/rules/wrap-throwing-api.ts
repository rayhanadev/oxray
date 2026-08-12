/**
 * @fileoverview Requires known throwing and rejecting APIs to execute inside Result boundaries.
 *
 * The catalog covers stable platform contracts and imported filesystem APIs. It stays syntax-based
 * because Oxlint does not expose custom type information to JavaScript plugin rules.
 */
import { astNodes } from "./ast-nodes.ts";
import {
  collectBetterResultImports,
  createBetterResultImportState,
  enclosingResultBoundaryMethod,
} from "./better-result-ast.ts";
import type { AstNode, OxlintRule } from "./types.ts";
import {
  calleeName,
  collectZodImports,
  memberName,
  unwrapExpression,
  zodRootIdentifier,
} from "./zod-ast.ts";

interface ThrowingImportState {
  readonly promiseFunctions: Set<string>;
  readonly promiseNamespaces: Set<string>;
  readonly syncFunctions: Set<string>;
  readonly syncNamespaces: Set<string>;
}

const synchronousGlobals = new Set(["BigInt", "decodeURI", "decodeURIComponent"]);
const synchronousConstructors = new Set(["RegExp", "URL"]);

function createThrowingImportState(): ThrowingImportState {
  return {
    promiseFunctions: new Set(),
    promiseNamespaces: new Set(),
    syncFunctions: new Set(),
    syncNamespaces: new Set(),
  };
}

function collectThrowingImports(program: AstNode, state: ThrowingImportState): void {
  state.promiseFunctions.clear();
  state.promiseNamespaces.clear();
  state.syncFunctions.clear();
  state.syncNamespaces.clear();

  const statements = Array.isArray(program.body) ? program.body : [];
  for (const statement of statements) {
    if (statement.type !== "ImportDeclaration") {
      continue;
    }
    const source = statement.source?.value;
    const isPromiseFs = source === "node:fs/promises" || source === "fs/promises";
    const isSyncFs = source === "node:fs" || source === "fs";
    if (!isPromiseFs && !isSyncFs) {
      continue;
    }

    for (const specifier of statement.specifiers ?? []) {
      const local = specifier.local?.name;
      if (!local) {
        continue;
      }
      if (
        specifier.type === "ImportNamespaceSpecifier" ||
        specifier.type === "ImportDefaultSpecifier"
      ) {
        (isPromiseFs ? state.promiseNamespaces : state.syncNamespaces).add(local);
      } else if (specifier.type === "ImportSpecifier") {
        const imported = specifier.imported?.name;
        if (isPromiseFs || imported?.endsWith("Sync")) {
          (isPromiseFs ? state.promiseFunctions : state.syncFunctions).add(local);
        }
      }
    }
  }
}

function isJsonParse(node: AstNode): boolean {
  const callee = unwrapExpression(node.callee);
  const object = unwrapExpression(callee?.object);
  return (
    callee?.type === "MemberExpression" &&
    object?.type === "Identifier" &&
    object.name === "JSON" &&
    memberName(callee) === "parse"
  );
}

function importedOperationKind(
  node: AstNode,
  state: ThrowingImportState,
): "async" | "sync" | undefined {
  const callee = unwrapExpression(node.callee);
  if (callee?.type === "Identifier") {
    if (callee.name && state.promiseFunctions.has(callee.name)) {
      return "async";
    }
    if (callee.name && state.syncFunctions.has(callee.name)) {
      return "sync";
    }
    return undefined;
  }

  const object = unwrapExpression(callee?.object);
  if (object?.type !== "Identifier" || !object.name) {
    return undefined;
  }
  if (state.promiseNamespaces.has(object.name)) {
    return "async";
  }
  if (state.syncNamespaces.has(object.name) && (memberName(callee)?.endsWith("Sync") ?? false)) {
    return "sync";
  }
  return undefined;
}

function operationKind(
  node: AstNode,
  imports: ThrowingImportState,
  zodRoots: ReadonlySet<string>,
): "async" | "sync" | "zod" | undefined {
  if (isJsonParse(node) || synchronousGlobals.has(calleeName(node.callee) ?? "")) {
    return "sync";
  }
  if (calleeName(node.callee) === "fetch") {
    return "async";
  }

  const method = memberName(node.callee);
  if (method === "json") {
    const callee = unwrapExpression(node.callee);
    const object = unwrapExpression(callee?.object);
    if (!(object?.type === "Identifier" && object.name === "Response")) {
      return "async";
    }
  }
  if ((method === "parse" || method === "parseAsync") && zodRootIdentifier(node, zodRoots)) {
    return method === "parseAsync" ? "async" : "zod";
  }
  return importedOperationKind(node, imports);
}

const wrapThrowingApi = {
  meta: {
    type: "problem",
    docs: {
      description: "Require Result boundaries around throwing APIs",
    },
    messages: {
      async:
        "This operation can reject. Execute it inside Result.tryPromise(...) with a tagged error.",
      sync: "This operation can throw. Execute it inside Result.try(...) with a tagged error.",
      zod: "Zod parse can throw. Use safeParse(...) and convert the failure to Result.err(...).",
    },
    schema: [],
  },
  create(context) {
    const betterResult = createBetterResultImportState();
    const throwingImports = createThrowingImportState();
    const zod = { roots: new Set<string>() };

    function boundaryAccepts(kind: "async" | "sync" | "zod", rawNode: unknown): boolean {
      const ancestors = astNodes(context.sourceCode.getAncestors(rawNode as never));
      const boundary = enclosingResultBoundaryMethod(ancestors, betterResult);
      if (kind === "zod") {
        return false;
      }
      return kind === "async" ? boundary === "tryPromise" : boundary !== undefined;
    }

    return {
      Program(rawNode) {
        const node = rawNode as AstNode;
        collectBetterResultImports(node, betterResult);
        collectThrowingImports(node, throwingImports);
        collectZodImports(node, zod);
      },
      CallExpression(rawNode) {
        const node = rawNode as AstNode;
        const kind = operationKind(node, throwingImports, zod.roots);
        if (kind && !boundaryAccepts(kind, rawNode)) {
          context.report({ node: rawNode, messageId: kind });
        }
      },
      ImportExpression(rawNode) {
        if (!boundaryAccepts("async", rawNode)) {
          context.report({ node: rawNode, messageId: "async" });
        }
      },
      NewExpression(rawNode) {
        const node = rawNode as AstNode;
        if (
          synchronousConstructors.has(calleeName(node.callee) ?? "") &&
          !boundaryAccepts("sync", rawNode)
        ) {
          context.report({ node: rawNode, messageId: "sync" });
        }
      },
    };
  },
} satisfies OxlintRule;

export default wrapThrowingApi;
