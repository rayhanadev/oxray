import type { RuleTester } from "oxlint/plugins-dev";

export type OxlintRule = Parameters<RuleTester["run"]>[1];

export interface AstNode {
  alternate?: AstNode | null;
  argument?: AstNode;
  arguments?: AstNode[];
  block?: AstNode;
  type: string;
  body?: AstNode | AstNode[];
  callee?: AstNode;
  computed?: boolean;
  consequent?: AstNode;
  declarations?: AstNode[];
  elements?: Array<AstNode | null>;
  expression?: AstNode;
  finalizer?: AstNode | null;
  handler?: AstNode | null;
  id?: AstNode;
  importKind?: string;
  imported?: AstNode;
  init?: AstNode | null;
  key?: AstNode;
  kind?: string;
  left?: AstNode;
  local?: AstNode;
  members?: AstNode[];
  name?: string;
  object?: AstNode;
  operator?: string;
  parameters?: AstNode[];
  params?: AstNode[];
  properties?: AstNode[];
  property?: AstNode;
  right?: AstNode;
  source?: AstNode;
  specifiers?: AstNode[];
  test?: AstNode;
  typeName?: AstNode;
  typeAnnotation?: AstNode;
  typeArguments?: AstNode;
  typeParameters?: AstNode;
  value?: boolean | number | string | null | AstNode;
}
