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

export function createZodImportState(): ZodImportState {
  return { roots: new Set() };
}

function isZod4Source(source: AstNode["value"]): boolean {
  return source === "zod" || source === "zod/v4" || source === "zod/v4/classic";
}

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

export function zodImportVisitor(state: ZodImportState): {
  Program: (node: unknown) => void;
} {
  return {
    Program(node) {
      collectZodImports(node as AstNode, state);
    },
  };
}

export function unwrapExpression(node: AstNode | null | undefined): AstNode | undefined {
  let current = node ?? undefined;
  while (current && transparentExpressionTypes.has(current.type)) {
    current = current.expression;
  }
  return current;
}

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
    return children.some(visit);
  }

  return visit(node);
}

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

export function memberName(node: AstNode | null | undefined): string | undefined {
  const current = unwrapExpression(node);
  return current?.type === "MemberExpression" ? propertyName(current.property) : undefined;
}

export function calleeName(node: AstNode | null | undefined): string | undefined {
  const current = unwrapExpression(node);
  if (current?.type === "Identifier") {
    return current.name;
  }
  return memberName(current);
}

export function isMethodCall(node: AstNode | null | undefined, method: string): boolean {
  const current = unwrapExpression(node);
  return current?.type === "CallExpression" && memberName(current.callee) === method;
}

export function methodReceiver(node: AstNode | null | undefined): AstNode | undefined {
  const current = unwrapExpression(node);
  const callee = unwrapExpression(current?.callee);
  return callee?.type === "MemberExpression" ? unwrapExpression(callee.object) : undefined;
}

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

export function zodRootConstructor(
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
    return memberName(callee);
  }
  return zodRootConstructor(object, roots);
}

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

export function hasProperty(node: AstNode | null | undefined, name: string): boolean {
  const current = unwrapExpression(node);
  return (
    current?.type === "ObjectExpression" &&
    (current.properties ?? []).some(
      (property) => property.type === "Property" && propertyName(property.key) === name,
    )
  );
}

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

export function isFunctionNode(node: AstNode | null | undefined): boolean {
  return (
    node?.type === "ArrowFunctionExpression" ||
    node?.type === "FunctionDeclaration" ||
    node?.type === "FunctionExpression"
  );
}

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

export function isInsideTryBlock(ancestors: readonly AstNode[]): boolean {
  return ancestors.some((ancestor, index) => {
    if (ancestor.type !== "TryStatement") {
      return false;
    }
    return ancestors[index + 1] === ancestor.block;
  });
}

export function isPrimitiveLiteral(node: AstNode | null | undefined): boolean {
  const current = unwrapExpression(node);
  if (current?.type !== "Literal") {
    return false;
  }
  const constructor = (current.value as { constructor?: unknown } | null)?.constructor;
  return current.value === null || [Boolean, Number, String].includes(constructor as never);
}

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

export function isToolDefinitionCall(node: AstNode | null | undefined): boolean {
  const name = calleeName(unwrapExpression(node)?.callee);
  return name === "defineTool" || name === "defineDomainTool";
}

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
