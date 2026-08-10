import type { RuleTester } from "oxlint/plugins-dev";

export type OxlintRule = Parameters<RuleTester["run"]>[1];

export interface AstNode {
  argument?: AstNode;
  arguments?: AstNode[];
  block?: AstNode;
  type: string;
  body?: AstNode[];
  callee?: AstNode;
  computed?: boolean;
  declarations?: AstNode[];
  elements?: Array<AstNode | null>;
  expression?: AstNode;
  finalizer?: AstNode | null;
  handler?: AstNode | null;
  id?: AstNode;
  init?: AstNode | null;
  key?: AstNode;
  kind?: string;
  left?: AstNode;
  members?: AstNode[];
  name?: string;
  object?: AstNode;
  operator?: string;
  parameters?: AstNode[];
  params?: AstNode[];
  properties?: AstNode[];
  property?: AstNode;
  right?: AstNode;
  typeName?: AstNode;
  typeAnnotation?: AstNode;
  typeArguments?: AstNode;
  typeParameters?: AstNode;
  value?: boolean | number | string | null | AstNode;
}
