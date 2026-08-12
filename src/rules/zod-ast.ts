/**
 * @fileoverview Resolves Zod syntax for rules that inspect schema chains and tool inputs.
 *
 * The helpers track actual Zod 4 imports. They also unwrap transparent TypeScript expressions so
 * rules do not mistake unrelated builders for Zod schemas.
 */
import type { AstNode } from "./types.ts";

export interface ZodImportState {
  readonly roots: Set<string>;
}

const transparentExpressionTypes = new Set([
  "ChainExpression",
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSInstantiationExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

export const zodObjectConstructors = new Set(["looseObject", "object", "strictObject"]);

/** Creates isolated import state because each linted program can bind Zod to different names. */
export function createZodImportState(): ZodImportState {
  return { roots: new Set() };
}

function isZod4Source(source: AstNode["value"]): boolean {
  return source === "zod" || source === "zod/v4" || source === "zod/v4/classic";
}

/** Collects local Zod 4 bindings while excluding explicit Zod 3 imports. */
export function collectZodImports(program: AstNode, state: ZodImportState): void {
  state.roots.clear();
  const statements = Array.isArray(program.body) ? program.body : [];
  for (const statement of statements) {
    if (statement.type !== "ImportDeclaration" || !isZod4Source(statement.source?.value)) {
      continue;
    }

    for (const specifier of statement.specifiers ?? []) {
      const local = propertyName(specifier.local);
      if (!local) {
        continue;
      }
      if (
        specifier.type === "ImportNamespaceSpecifier" ||
        specifier.type === "ImportDefaultSpecifier" ||
        (specifier.type === "ImportSpecifier" &&
          ["default", "z"].includes(propertyName(specifier.imported) ?? ""))
      ) {
        state.roots.add(local);
      }
    }
  }
}

/** Provides a Program visitor so rules can compose import discovery with other visitors. */
export function zodImportVisitor(state: ZodImportState): {
  Program: (node: unknown) => void;
} {
  return {
    Program(node) {
      collectZodImports(node as AstNode, state);
    },
  };
}

/** Removes transparent wrappers because they do not change the underlying Zod expression. */
export function unwrapExpression(node: AstNode | null | undefined): AstNode | undefined {
  let current = node ?? undefined;
  while (current && transparentExpressionTypes.has(current.type)) {
    const expression = current.expression;
    current = Object(expression) === expression ? (expression as AstNode) : undefined;
  }
  return current;
}

/** Searches known AST children while preventing cycles from malformed or extended syntax trees. */
export function astSubtreeSome(
  node: AstNode | null | undefined,
  predicate: (candidate: AstNode) => boolean,
): boolean {
  const seen = new Set<AstNode>();

  function visit(candidate: AstNode | null | undefined): boolean {
    if (!candidate || seen.has(candidate)) {
      return false;
    }
    seen.add(candidate);
    if (predicate(candidate)) {
      return true;
    }

    const body = Array.isArray(candidate.body) ? candidate.body : [candidate.body];
    const propertyValue = candidate.type === "Property" ? (candidate.value as AstNode) : undefined;
    const children = [
      candidate.alternate,
      candidate.argument,
      candidate.block,
      candidate.callee,
      candidate.consequent,
      candidate.expression,
      candidate.finalizer,
      candidate.handler,
      candidate.id,
      candidate.imported,
      candidate.init,
      candidate.key,
      candidate.left,
      candidate.local,
      candidate.object,
      candidate.property,
      propertyValue,
      candidate.right,
      candidate.source,
      candidate.test,
      candidate.typeAnnotation,
      candidate.typeName,
      ...body,
      ...(candidate.arguments ?? []),
      ...(candidate.declarations ?? []),
      ...(candidate.elements ?? []),
      ...(candidate.members ?? []),
      ...(candidate.parameters ?? []),
      ...(candidate.params ?? []),
      ...(candidate.properties ?? []),
      ...(candidate.specifiers ?? []),
    ];
    return children.some((child) => Object(child) === child && visit(child as AstNode));
  }

  return visit(node);
}

/** Reads identifier and literal property names because both forms are equivalent in ESTree. */
export function propertyName(node: AstNode | null | undefined): string | undefined {
  const current = unwrapExpression(node);
  if (current?.type === "Identifier") {
    return current.name;
  }
  if (current?.type === "Literal" && current.value !== undefined) {
    return current.value as string;
  }
  return undefined;
}

/** Returns a member property name after the analysis removes transparent wrappers. */
export function memberName(node: AstNode | null | undefined): string | undefined {
  const current = unwrapExpression(node);
  return current?.type === "MemberExpression" ? propertyName(current.property) : undefined;
}

/** Returns the stable name for direct and member call targets. */
export function calleeName(node: AstNode | null | undefined): string | undefined {
  const current = unwrapExpression(node);
  if (current?.type === "Identifier") {
    return current.name;
  }
  return memberName(current);
}

/** Matches one method call without assuming that its receiver is Zod. */
export function isMethodCall(node: AstNode | null | undefined, method: string): boolean {
  const current = unwrapExpression(node);
  return current?.type === "CallExpression" && memberName(current.callee) === method;
}

/** Returns a method receiver so callers can continue walking a fluent chain. */
export function methodReceiver(node: AstNode | null | undefined): AstNode | undefined {
  const current = unwrapExpression(node);
  const callee = unwrapExpression(current?.callee);
  return callee?.type === "MemberExpression" ? unwrapExpression(callee.object) : undefined;
}

/** Finds one named call while walking from the end of a fluent chain to its root. */
export function methodCallInChain(
  node: AstNode | null | undefined,
  method: string,
): AstNode | undefined {
  const current = unwrapExpression(node);
  if (current?.type !== "CallExpression") {
    return undefined;
  }
  if (memberName(current.callee) === method) {
    return current;
  }
  return methodCallInChain(methodReceiver(current), method);
}

/** Matches a direct constructor only when its root resolves to a tracked Zod import. */
export function isDirectZodCall(
  node: AstNode | null | undefined,
  name: string,
  roots: ReadonlySet<string>,
): boolean {
  const current = unwrapExpression(node);
  const callee = unwrapExpression(current?.callee);
  const object = unwrapExpression(callee?.object);
  return (
    current?.type === "CallExpression" &&
    callee?.type === "MemberExpression" &&
    object?.type === "Identifier" &&
    object.name !== undefined &&
    roots.has(object.name) &&
    memberName(callee) === name
  );
}

/** Finds the tracked import name at the head of a fluent Zod chain. */
export function zodRootIdentifier(
  node: AstNode | null | undefined,
  roots: ReadonlySet<string>,
): string | undefined {
  const current = unwrapExpression(node);
  if (current?.type !== "CallExpression") {
    return undefined;
  }

  const callee = unwrapExpression(current.callee);
  if (callee?.type !== "MemberExpression") {
    return undefined;
  }

  const object = unwrapExpression(callee.object);
  if (object?.type === "Identifier" && object.name !== undefined && roots.has(object.name)) {
    return object.name;
  }
  return zodRootIdentifier(object, roots);
}

/** Finds the constructor call at the root of a tracked fluent Zod chain. */
export function zodRootCall(
  node: AstNode | null | undefined,
  roots: ReadonlySet<string>,
): AstNode | undefined {
  const current = unwrapExpression(node);
  if (current?.type !== "CallExpression") {
    return undefined;
  }

  const callee = unwrapExpression(current.callee);
  if (callee?.type !== "MemberExpression") {
    return undefined;
  }

  const object = unwrapExpression(callee.object);
  if (object?.type === "Identifier" && object.name !== undefined && roots.has(object.name)) {
    return current;
  }
  return zodRootCall(object, roots);
}

/** Finds the first Zod constructor name so rules can classify the schema family. */
export function zodRootConstructor(
  node: AstNode | null | undefined,
  roots: ReadonlySet<string>,
): string | undefined {
  return memberName(zodRootCall(node, roots)?.callee);
}

/** Finds selected calls in one fluent chain without traversing callback bodies. */
export function chainHasMethod(
  node: AstNode | null | undefined,
  methods: ReadonlySet<string>,
): boolean {
  const current = unwrapExpression(node);
  if (current?.type !== "CallExpression") {
    return false;
  }

  const callee = unwrapExpression(current.callee);
  if (callee?.type !== "MemberExpression") {
    return false;
  }

  const name = memberName(callee);
  return (name !== undefined && methods.has(name)) || chainHasMethod(callee.object, methods);
}

/** Checks an object literal for one explicit property because spreads cannot prove its presence. */
export function hasProperty(node: AstNode | null | undefined, name: string): boolean {
  const current = unwrapExpression(node);
  return (
    current?.type === "ObjectExpression" &&
    (current.properties ?? []).some(
      (property) => property.type === "Property" && propertyName(property.key) === name,
    )
  );
}

/** Splits a namespace-qualified type so rules can recognize forms such as `z.output`. */
export function qualifiedTypeName(
  node: AstNode | null | undefined,
): { namespace: string; name: string } | undefined {
  const current = unwrapExpression(node);
  const typeName = unwrapExpression(current?.typeName);
  if (current?.type !== "TSTypeReference" || typeName?.type !== "TSQualifiedName") {
    return undefined;
  }

  const left = unwrapExpression(typeName.left);
  const right = unwrapExpression(typeName.right);
  if (left?.type !== "Identifier" || right?.type !== "Identifier") {
    return undefined;
  }
  if (left.name === undefined || right.name === undefined) {
    return undefined;
  }
  return { namespace: left.name, name: right.name };
}

/** Identifies function syntax that can act as a refinement callback. */
export function isFunctionNode(node: AstNode | null | undefined): boolean {
  return (
    node?.type === "ArrowFunctionExpression" ||
    node?.type === "FunctionDeclaration" ||
    node?.type === "FunctionExpression"
  );
}

/** Finds the refinement call that owns a callback because outer try blocks do not protect it. */
export function enclosingRefinementCall(ancestors: readonly AstNode[]): AstNode | undefined {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const callback = ancestors[index];
    const parent = ancestors[index - 1];
    if (
      isFunctionNode(callback) &&
      parent?.type === "CallExpression" &&
      (parent.arguments ?? []).includes(callback!) &&
      ["check", "refine", "superRefine"].includes(memberName(parent.callee) ?? "")
    ) {
      return parent;
    }
  }
  return undefined;
}

/** Checks whether the current node is inside a try body rather than its handler or finalizer. */
export function isInsideTryBlock(ancestors: readonly AstNode[]): boolean {
  return ancestors.some((ancestor, index) => {
    if (ancestor.type !== "TryStatement") {
      return false;
    }
    return ancestors[index + 1] === ancestor.block;
  });
}

/** Accepts only primitive literals because array literal unions need one JSON scalar family. */
export function isPrimitiveLiteral(node: AstNode | null | undefined): boolean {
  const current = unwrapExpression(node);
  if (current?.type !== "Literal") {
    return false;
  }
  const constructor = (current.value as { constructor?: unknown } | null)?.constructor;
  return current.value === null || [Boolean, Number, String].includes(constructor as never);
}

/** Returns a primitive family so a rewrite cannot combine incompatible literal types. */
export function primitiveLiteralKind(node: AstNode): string {
  if (node.value === null) {
    return "null";
  }
  const constructor = (node.value as { constructor?: unknown }).constructor;
  if (constructor === Boolean) {
    return "boolean";
  }
  if (constructor === Number) {
    return "number";
  }
  return "string";
}

/** Recognizes the two repository tool factories that expose model-facing input schemas. */
export function isToolDefinitionCall(node: AstNode | null | undefined): boolean {
  const name = calleeName(unwrapExpression(node)?.callee);
  return name === "defineTool" || name === "defineDomainTool";
}

/** Checks whether a property directly defines input for a recognized tool factory. */
export function isToolInputProperty(property: AstNode, ancestors: readonly AstNode[]): boolean {
  if (
    property.type !== "Property" ||
    !["input", "inputSchema"].includes(propertyName(property.key) ?? "")
  ) {
    return false;
  }

  const objectIndex = ancestors.findLastIndex((ancestor) => ancestor.type === "ObjectExpression");
  const parent = ancestors[objectIndex - 1];
  return parent?.type === "CallExpression" && isToolDefinitionCall(parent);
}

/** Checks nested schema nodes against the nearest recognized tool input boundary. */
export function isInsideToolInput(ancestors: readonly AstNode[]): boolean {
  for (let index = ancestors.length - 1; index >= 2; index -= 1) {
    const property = ancestors[index];
    const object = ancestors[index - 1];
    const call = ancestors[index - 2];
    if (
      property?.type === "Property" &&
      ["input", "inputSchema"].includes(propertyName(property.key) ?? "") &&
      object?.type === "ObjectExpression" &&
      call?.type === "CallExpression" &&
      isToolDefinitionCall(call)
    ) {
      return true;
    }
  }
  return false;
}
