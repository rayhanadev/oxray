/**
 * @fileoverview Resolves better-result imports and the expressions rooted in those imports.
 *
 * The helpers require an imported binding before they classify Result calls. This constraint keeps
 * unrelated APIs named `Result`, `unwrap`, or `TaggedError` outside the rules.
 */
import { isAstNode } from "./ast-nodes.ts";
import type { AstNode } from "./types.ts";
import {
  isFunctionNode,
  memberName,
  methodReceiver,
  propertyName,
  unwrapExpression,
} from "./zod-ast.ts";

export interface BetterResultImportState {
  readonly namespaces: Set<string>;
  readonly results: Set<string>;
  readonly taggedErrors: Set<string>;
}

interface ProgramVisitor {
  Program: (node: unknown) => void;
}

const resultFactories = new Set(["all", "err", "gen", "ok", "try"]);

/** Creates isolated import state because each program can rename better-result exports. */
export function createBetterResultImportState(): BetterResultImportState {
  return {
    namespaces: new Set(),
    results: new Set(),
    taggedErrors: new Set(),
  };
}

function collectNamedImport(specifier: AstNode, state: BetterResultImportState): void {
  const imported = propertyName(specifier.imported);
  const local = propertyName(specifier.local);
  if (!imported || !local) {
    return;
  }

  if (imported === "Result") {
    state.results.add(local);
  } else if (imported === "TaggedError") {
    state.taggedErrors.add(local);
  }
}

/** Collects local bindings from the package root because better-result 3 exposes one public entry. */
export function collectBetterResultImports(program: AstNode, state: BetterResultImportState): void {
  state.namespaces.clear();
  state.results.clear();
  state.taggedErrors.clear();

  const statements = Array.isArray(program.body) ? program.body : [];
  for (const statement of statements) {
    if (statement.type !== "ImportDeclaration" || statement.source?.value !== "better-result") {
      continue;
    }

    for (const specifier of statement.specifiers ?? []) {
      const local = propertyName(specifier.local);
      if (specifier.type === "ImportNamespaceSpecifier" && local) {
        state.namespaces.add(local);
      } else if (specifier.type === "ImportSpecifier") {
        collectNamedImport(specifier, state);
      }
    }
  }
}

/** Provides a Program visitor so each rule can compose import discovery with its own visitors. */
export function betterResultImportVisitor(state: BetterResultImportState): ProgramVisitor {
  return {
    Program(node) {
      collectBetterResultImports(node as AstNode, state);
    },
  } satisfies ProgramVisitor;
}

/** Resolves the expression that exposes static Result methods. */
export function resultNamespaceNode(
  node: AstNode | null | undefined,
  state: BetterResultImportState,
): AstNode | undefined {
  const current = unwrapExpression(node);
  if (
    current?.type === "Identifier" &&
    current.name !== undefined &&
    state.results.has(current.name)
  ) {
    return current;
  }

  const object = unwrapExpression(current?.object);
  if (
    current?.type === "MemberExpression" &&
    object?.type === "Identifier" &&
    object.name !== undefined &&
    state.namespaces.has(object.name) &&
    memberName(current) === "Result"
  ) {
    return current;
  }
  return undefined;
}

/** Matches a static Result call and supports named, aliased, and namespace imports. */
export function isResultStaticCall(
  node: AstNode | null | undefined,
  method: string,
  state: BetterResultImportState,
): boolean {
  const current = unwrapExpression(node);
  const callee = unwrapExpression(current?.callee);
  return (
    current?.type === "CallExpression" &&
    callee?.type === "MemberExpression" &&
    resultNamespaceNode(callee.object, state) !== undefined &&
    memberName(callee) === method
  );
}

/** Returns the imported Result expression for a matching static call. */
export function resultRootForCall(
  node: AstNode | null | undefined,
  state: BetterResultImportState,
): AstNode | undefined {
  const current = unwrapExpression(node);
  const callee = unwrapExpression(current?.callee);
  if (current?.type !== "CallExpression" || callee?.type !== "MemberExpression") {
    return undefined;
  }
  return resultNamespaceNode(callee.object, state);
}

/** Recognizes a Result-producing expression that starts at a tracked static factory. */
export function isKnownResultExpression(
  node: AstNode | null | undefined,
  state: BetterResultImportState,
): boolean {
  const current = unwrapExpression(node);
  if (current?.type === "ConditionalExpression") {
    return (
      isKnownResultExpression(current.consequent, state) &&
      isKnownResultExpression(current.alternate, state)
    );
  }
  if (current?.type !== "CallExpression") {
    return false;
  }

  const callee = unwrapExpression(current.callee);
  const method = memberName(callee);
  if (method && resultFactories.has(method) && isResultStaticCall(current, method, state)) {
    return true;
  }
  return isKnownResultExpression(methodReceiver(current), state);
}

/** Accepts explicit Ok and Err returns because Result.gen rejects bare generator values. */
export function isExplicitResultGenReturn(
  node: AstNode | null | undefined,
  state: BetterResultImportState,
): boolean {
  const current = unwrapExpression(node);
  if (current?.type === "ConditionalExpression") {
    return (
      isExplicitResultGenReturn(current.consequent, state) &&
      isExplicitResultGenReturn(current.alternate, state)
    );
  }
  return isResultStaticCall(current, "ok", state) || isResultStaticCall(current, "err", state);
}

/** Returns a direct function callback supplied to a static Result call. */
export function directResultCallback(
  call: AstNode,
  method: string,
  state: BetterResultImportState,
): AstNode | undefined {
  if (!isResultStaticCall(call, method, state)) {
    return undefined;
  }
  const callback = unwrapExpression(call.arguments?.[0]);
  return isFunctionNode(callback) ? callback : undefined;
}

function objectPropertyValue(
  object: AstNode | null | undefined,
  name: string,
): AstNode | undefined {
  const current = unwrapExpression(object);
  if (current?.type !== "ObjectExpression") {
    return undefined;
  }
  const property = (current.properties ?? []).find(
    (candidate) => candidate.type === "Property" && propertyName(candidate.key) === name,
  );
  const value = property?.value;
  return isAstNode(value) ? unwrapExpression(value) : undefined;
}

/** Finds the function that Result.try or Result.tryPromise executes. */
export function resultBoundaryCallback(
  call: AstNode,
  state: BetterResultImportState,
): AstNode | undefined {
  if (!isResultStaticCall(call, "try", state) && !isResultStaticCall(call, "tryPromise", state)) {
    return undefined;
  }
  const firstArgument = unwrapExpression(call.arguments?.[0]);
  if (isFunctionNode(firstArgument)) {
    return firstArgument;
  }
  const callback = objectPropertyValue(firstArgument, "try");
  return isFunctionNode(callback) ? callback : undefined;
}

/** Returns the Result boundary that executes the nearest enclosing function. */
export function enclosingResultBoundaryMethod(
  ancestors: readonly AstNode[],
  state: BetterResultImportState,
): "try" | "tryPromise" | undefined {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const candidate = ancestors[index];
    if (!isFunctionNode(candidate)) {
      continue;
    }

    for (let ownerIndex = index - 1; ownerIndex >= 0; ownerIndex -= 1) {
      const owner = ancestors[ownerIndex]!;
      if (owner.type === "CallExpression") {
        if (resultBoundaryCallback(owner, state) !== candidate) {
          return undefined;
        }
        return isResultStaticCall(owner, "tryPromise", state) ? "tryPromise" : "try";
      }
      if (isFunctionNode(owner)) {
        return undefined;
      }
    }
    return undefined;
  }
  return undefined;
}

/** Finds the Result.gen call that owns the nearest enclosing function. */
export function enclosingResultGenCall(
  ancestors: readonly AstNode[],
  state: BetterResultImportState,
): AstNode | undefined {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const candidate = ancestors[index];
    if (!isFunctionNode(candidate)) {
      continue;
    }
    const owner = ancestors[index - 1];
    return owner?.type === "CallExpression" &&
      directResultCallback(owner, "gen", state) === candidate
      ? owner
      : undefined;
  }
  return undefined;
}

/** Checks whether a class extends TaggedError from the tracked package import. */
export function isTaggedErrorSuperclass(
  node: AstNode | null | undefined,
  state: BetterResultImportState,
): boolean {
  const current = unwrapExpression(node);
  if (
    current?.type === "Identifier" &&
    current.name !== undefined &&
    state.taggedErrors.has(current.name)
  ) {
    return true;
  }
  const callee = unwrapExpression(current?.callee);
  if (
    current?.type === "CallExpression" &&
    callee?.type === "Identifier" &&
    callee.name !== undefined &&
    state.taggedErrors.has(callee.name)
  ) {
    return true;
  }
  const object = unwrapExpression(callee?.object ?? current?.object);
  return (
    object?.type === "Identifier" &&
    object.name !== undefined &&
    state.namespaces.has(object.name) &&
    memberName(callee ?? current) === "TaggedError"
  );
}
