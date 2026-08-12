/**
 * Rejects dictionary contracts whose direct values use broad escape hatches.
 *
 * The rule resolves local aliases, generic substitutions, mapped types, and utility wrappers.
 * Concrete dictionary value contracts remain valid.
 */
import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import {
  classifyUnsafeDictionary,
  classifyUnsafeDictionaryValue,
  createTypeEnvironment,
  type TypeEnvironment,
} from "./type-evidence.ts";

function isTypeNode(node: ESTree.Node): node is ESTree.TSType {
  return node.type.startsWith("TS") && node.type !== "TSTypeAnnotation";
}

function typeReferenceName(type: ESTree.TSTypeReference): string | null {
  return type.typeName.type === "Identifier" ? type.typeName.name : null;
}

function isInsideTypeAlias(node: ESTree.Node): boolean {
  let current: ESTree.Node | null = node.parent;
  while (current !== null && current.type !== "Program") {
    if (current.type === "TSTypeAliasDeclaration") {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isAliasConsumer(node: ESTree.TSType, environment: TypeEnvironment): boolean {
  if (node.type !== "TSTypeReference" || (node.typeArguments?.params.length ?? 0) > 0) {
    return false;
  }
  const name = typeReferenceName(node);
  return name !== null && environment.aliases.has(name) && !isInsideTypeAlias(node);
}

function shouldReport(node: ESTree.TSType, environment: TypeEnvironment): boolean {
  if (isAliasConsumer(node, environment) || classifyUnsafeDictionary(node, environment) === null) {
    return false;
  }
  let current: ESTree.Node | null = node.parent;
  while (current !== null && current.type !== "Program") {
    if (isTypeNode(current) && classifyUnsafeDictionary(current, environment) !== null) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

const noUnsafeDictionaryType = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow dictionary value contracts that use broad escape hatches",
    },
    messages: {
      unsafe:
        "This dictionary uses an unsafe {{value}} value contract. Use a concrete owner type and parse external data at its boundary.",
    },
  },
  createOnce(context) {
    let environment: TypeEnvironment | null = null;

    function reportIfUnsafe(node: ESTree.TSType): void {
      if (environment === null || !shouldReport(node, environment)) {
        return;
      }
      const unsafe = classifyUnsafeDictionary(node, environment);
      if (unsafe !== null) {
        context.report({
          node,
          messageId: "unsafe",
          data: { value: unsafe.unsafeValue },
        });
      }
    }

    return {
      Program(node) {
        environment = createTypeEnvironment(node);
      },
      TSMappedType: reportIfUnsafe,
      TSTypeLiteral: reportIfUnsafe,
      TSTypeReference: reportIfUnsafe,
      TSIndexSignature(node) {
        if (
          environment === null ||
          node.typeAnnotation === null ||
          node.parent.type === "TSTypeLiteral"
        ) {
          return;
        }
        const unsafe = classifyUnsafeDictionaryValue(
          node.typeAnnotation.typeAnnotation,
          environment,
        );
        if (unsafe !== null) {
          context.report({
            node,
            messageId: "unsafe",
            data: { value: unsafe.unsafeValue },
          });
        }
      },
    };
  },
});

export default noUnsafeDictionaryType;
