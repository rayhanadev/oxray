import type { RuleTester } from "oxlint/plugins-dev";

export type OxlintRule = Parameters<RuleTester["run"]>[1];
type OxlintCreate = Exclude<OxlintRule["create"], undefined>;
export type OxlintContext = Parameters<OxlintCreate>[0];
type OxlintDiagnostic = Parameters<OxlintContext["report"]>[0];
export type OxlintFix = NonNullable<OxlintDiagnostic["fix"]>;
export type OxlintReportNode = NonNullable<OxlintDiagnostic["node"]>;

export interface AstNode {
  alternate?: AstNode | null;
  argument?: AstNode;
  arguments?: AstNode[];
  block?: AstNode;
  type: string;
  body?: AstNode | AstNode[];
  callee?: AstNode;
  cases?: AstNode[];
  computed?: boolean;
  consequent?: AstNode;
  declaration?: AstNode | null;
  declarations?: AstNode[];
  decorators?: AstNode[];
  elements?: Array<AstNode | null>;
  discriminant?: AstNode;
  expression?: AstNode | boolean;
  exportKind?: string;
  finalizer?: AstNode | null;
  handler?: AstNode | null;
  id?: AstNode | null;
  importKind?: string;
  imported?: AstNode;
  init?: AstNode | null;
  key?: AstNode;
  kind?: string;
  left?: AstNode;
  local?: AstNode;
  loc?: {
    end: { column: number; line: number };
    start: { column: number; line: number };
  };
  members?: AstNode[];
  name?: string;
  object?: AstNode;
  operator?: string;
  optional?: boolean;
  parameters?: AstNode[];
  params?: AstNode[];
  properties?: AstNode[];
  property?: AstNode;
  right?: AstNode;
  range?: [number, number];
  source?: AstNode;
  specifiers?: AstNode[];
  start?: number;
  end?: number;
  test?: AstNode;
  typeName?: AstNode;
  typeAnnotation?: AstNode;
  typeArguments?: AstNode;
  typeParameters?: AstNode;
  value?: boolean | number | string | null | AstNode;
}

export interface SourceComment {
  end: number;
  loc: {
    end: { column: number; line: number };
    start: { column: number; line: number };
  };
  range: [number, number];
  start: number;
  type: "Block" | "Line" | "Shebang";
  value: string;
}

export type VisitorKeys = Readonly<Record<string, readonly string[]>>;
