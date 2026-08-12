import type { AstNode, OxlintFix } from "./types.ts";

export interface TextEdit {
  readonly range: [number, number];
  readonly text: string;
}

export interface Correction {
  readonly fix: OxlintFix;
  readonly replacement: string;
}

/** Reads one node without depending on the plugin API's concrete AST types. */
export function sourceTextForNode(
  sourceText: string,
  node: AstNode | null | undefined,
): string | undefined {
  return node?.range ? sourceText.slice(...node.range) : undefined;
}

/** Creates one replacement edit when the parser supplied a source range. */
export function replaceNode(node: AstNode | null | undefined, text: string): TextEdit | undefined {
  return node?.range ? { range: node.range, text } : undefined;
}

/** Creates one removal edit for a contiguous source range. */
export function removeRange(
  start: number | undefined,
  end: number | undefined,
): TextEdit | undefined {
  return start === undefined || end === undefined ? undefined : { range: [start, end], text: "" };
}

/**
 * Builds display text and a fixer from the same edits.
 *
 * Edits must be non-overlapping and remain inside the reported node.
 */
export function correctionFromEdits(
  sourceText: string,
  node: AstNode,
  edits: readonly (TextEdit | undefined)[],
): Correction | undefined {
  const concreteEdits = edits.filter((edit): edit is TextEdit => edit !== undefined);
  if (!node.range || concreteEdits.length !== edits.length) {
    return undefined;
  }

  const [nodeStart, nodeEnd] = node.range;
  const descending = concreteEdits.toSorted((left, right) => right.range[0] - left.range[0]);
  let replacement = sourceText.slice(nodeStart, nodeEnd);
  let priorStart = nodeEnd;

  for (const edit of descending) {
    const [start, end] = edit.range;
    if (start < nodeStart || end > nodeEnd || start > end || end > priorStart) {
      return undefined;
    }
    replacement =
      replacement.slice(0, start - nodeStart) + edit.text + replacement.slice(end - nodeStart);
    priorStart = start;
  }

  return {
    replacement,
    fix: (fixer) => concreteEdits.map((edit) => fixer.replaceTextRange(edit.range, edit.text)),
  };
}
