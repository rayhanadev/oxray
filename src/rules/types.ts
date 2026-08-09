import type { RuleTester } from "oxlint/plugins-dev";

export type OxlintRule = Parameters<RuleTester["run"]>[1];

export interface AstNode {
  type: string;
  body?: AstNode[];
  callee?: AstNode;
  computed?: boolean;
  expression?: AstNode;
  members?: AstNode[];
  name?: string;
  parameters?: AstNode[];
  params?: AstNode[];
  property?: AstNode;
  typeAnnotation?: AstNode;
  typeArguments?: AstNode;
  typeName?: AstNode;
  typeParameters?: AstNode;
  value?: string;
}
