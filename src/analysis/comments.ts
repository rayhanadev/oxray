/**
 * @fileoverview Extracts prose and structured metadata from source comments.
 *
 * Comment rules share this parser so code examples, directives, sentence limits, and word counts
 * have the same meaning in every diagnostic.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { AstNode, SourceComment, VisitorKeys } from "../rules/types.ts";

export interface CommentSourceCode {
  ast: AstNode;
  lines: string[];
  text: string;
  visitorKeys: VisitorKeys;
  getAncestors(node: AstNode): AstNode[];
  getAllComments(): SourceComment[];
  getCommentsBefore(node: AstNode): SourceComment[];
}

export interface CommentProse {
  comment: SourceComment;
  isJSDoc: boolean;
  paragraphs: string[];
  text: string;
}

export interface CommentSentence {
  paragraph: number;
  text: string;
  words: number;
}

export interface AgentsReference {
  fragment: string;
  path: string;
}

const directivePattern =
  /^\s*(?:[#@]\s*sourceMappingURL|@(?:__NO_SIDE_EFFECTS__|license|preserve|ts-expect-error|ts-ignore|ts-nocheck)|c8\s|eslint[- ]|istanbul\s|oxlint-|prettier-|spdx-|webpack|\/\s*<reference)/iu;
const legalPattern = /^\s*(?:copyright|licensed under|mit license)/iu;
const decorativePattern = /^\s*[-=*_/#]{3,}\s*$/u;
const codeSignalPattern =
  /^(?:(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(|class\s+[A-Za-z_$][\w$]*(?:\s+extends\s+[^\s{]+)?\s*\{|(?:const|let|var)\s+[A-Za-z_$][\w$]*(?:\s*:[^=]+)?\s*=|import\s+(?:["'{*]|[A-Za-z_$][\w$]*\s+from\b)|export\s+(?:default\s+)?(?:async\s+)?(?:class|const|function|let|var)\b|(?:if|for|switch|while)\s*\(|(?:return|throw)\s+.+;\s*$|[A-Za-z_$][\w$]*\s*:\s*.+[,]\s*$|[}\])]+[,]?\s*$|(?:await\s+)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\([^\n]*\)\s*;\s*$)/u;
const contractionPattern =
  /\b(?:ain't|aren't|can't|couldn't|didn't|doesn't|don't|hadn't|hasn't|haven't|he's|here's|how's|i'd|i'll|i'm|i've|isn't|it'll|it's|let's|mustn't|shan't|she's|shouldn't|that's|there's|they'd|they'll|they're|they've|wasn't|we'd|we'll|we're|we've|weren't|what's|where's|who's|won't|wouldn't|you'd|you'll|you're|you've)\b/iu;

/** Distinguishes documentation blocks because declaration rules attach only JSDoc to APIs. */
export function isJSDocComment(comment: SourceComment): boolean {
  return comment.type === "Block" && comment.value.startsWith("*");
}

/** Excludes machine directives and legal notices because prose rules must preserve them exactly. */
export function isDirectiveOrLegalComment(comment: SourceComment): boolean {
  const value = comment.value.trim();
  return directivePattern.test(value) || legalPattern.test(value) || decorativePattern.test(value);
}

/** Finds syntax-shaped comment text so prose checks do not rewrite disabled code. */
export function isCodeLikeCommentText(value: string): boolean {
  return codeSignalPattern.test(value.trim());
}

function cleanJSDocLine(line: string): string {
  return line.replace(/^\s*\*?\s?/u, "");
}

function stripStructuredSyntax(line: string): { prose: string; skipFollowing: boolean } {
  const trimmed = line.trim();
  if (trimmed.startsWith("```")) {
    return { prose: "", skipFollowing: false };
  }
  if (/^@example\b/iu.test(trimmed)) {
    return { prose: "", skipFollowing: true };
  }
  if (/^@see\b/iu.test(trimmed)) {
    return { prose: "", skipFollowing: false };
  }
  const tag = /^@(fileoverview|remarks|deprecated|throws|returns?|param)\b\s*(.*)$/iu.exec(trimmed);
  if (!tag) {
    return { prose: line, skipFollowing: false };
  }
  let prose = tag[2] ?? "";
  if (/^@param\b/iu.test(trimmed)) {
    prose = prose
      .replace(/^\{[^}]*\}\s*/u, "")
      .replace(/^\[[^\]]+\]|^\S+/u, "")
      .trim();
    prose = prose.replace(/^[-–—]\s*/u, "");
  }
  return { prose, skipFollowing: false };
}

function normalizeProse(text: string): string {
  return text
    .replace(/`[^`\n]+`/gu, " CODE ")
    .replace(/\{@(?:link|linkcode|linkplain)\s+[^}]+\}/giu, " CODE ")
    .replace(/\[([^\]]+)\]\[[^\]]+\]/gu, "$1")
    .replace(/\[([^\]]+)\]\([^\s)]+\)/gu, "$1")
    .replace(/[“”"][^“”"\n]+[“”"]/gu, " QUOTE ")
    .replace(/https?:\/\/\S+/gu, " URL ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Extracts prose while excluding code, links, directives, and structured JSDoc syntax. */
export function extractCommentProse(comment: SourceComment): CommentProse | null {
  if (
    comment.type === "Shebang" ||
    legalPattern.test(comment.value.trim()) ||
    decorativePattern.test(comment.value.trim())
  ) {
    return null;
  }
  const suppressionRationale =
    /(?:eslint|oxlint)-disable(?:-line|-next-line)?\b[^\n]*?\s--\s+(.+)$/iu.exec(
      comment.value.trim(),
    )?.[1];
  if (suppressionRationale) {
    const paragraph = normalizeProse(suppressionRationale);
    return {
      comment,
      isJSDoc: false,
      paragraphs: paragraph.length > 0 ? [paragraph] : [],
      text: paragraph,
    };
  }
  if (directivePattern.test(comment.value.trim())) {
    return null;
  }
  const jsdoc = isJSDocComment(comment);
  if (!jsdoc && isCodeLikeCommentText(comment.value)) {
    return null;
  }
  const lines = comment.value.split(/\r?\n/u).map((line) => (jsdoc ? cleanJSDocLine(line) : line));
  const paragraphs: string[] = [];
  let current: string[] = [];
  let fenced = false;
  let example = false;

  const flush = (): void => {
    const paragraph = normalizeProse(current.join(" "));
    if (paragraph.length > 0) {
      paragraphs.push(paragraph);
    }
    current = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      flush();
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      continue;
    }
    if (example && /^@\w+/u.test(trimmed)) {
      example = false;
    }
    if (example) {
      continue;
    }
    const structured = stripStructuredSyntax(line);
    if (structured.skipFollowing) {
      flush();
      example = true;
      continue;
    }
    if (structured.prose.trim().length === 0) {
      flush();
      continue;
    }
    if (/^@(deprecated|param|returns?|throws)\b/iu.test(trimmed)) {
      flush();
      current.push(structured.prose);
      flush();
      continue;
    }
    if (/^(?:[-*+]|\d+[.)])\s+/u.test(structured.prose)) {
      flush();
      current.push(structured.prose.replace(/^(?:[-*+]|\d+[.)])\s+/u, ""));
      flush();
      continue;
    }
    current.push(structured.prose);
  }
  flush();
  if (paragraphs.length === 0) {
    return { comment, isJSDoc: jsdoc, paragraphs: [], text: "" };
  }
  return { comment, isJSDoc: jsdoc, paragraphs, text: paragraphs.join("\n\n") };
}

/** Adds the documented Oxlint comment API while preserving the concrete source-code type. */
export function asCommentSource<Source extends { readonly text: string }>(
  sourceCode: Source,
): Source & CommentSourceCode {
  return sourceCode as Source & CommentSourceCode;
}

function protectAbbreviations(text: string): string {
  return text.replace(/\b(e\.g|i\.e|etc|vs)\./giu, (value) => value.replaceAll(".", "∯"));
}

/** Splits each paragraph independently because paragraph limits depend on sentence ownership. */
export function sentencesOf(prose: CommentProse): CommentSentence[] {
  const sentences: CommentSentence[] = [];
  for (const [paragraph, value] of prose.paragraphs.entries()) {
    const protectedText = protectAbbreviations(value);
    const parts = protectedText.split(/(?<=[.!?])(?:\s+|$)/u);
    for (const part of parts) {
      const text = part.replaceAll("∯", ".").trim();
      if (text.length > 0) {
        sentences.push({ paragraph, text, words: countSteWords(text) });
        for (const match of text.matchAll(/\(([^()]*)\)/gu)) {
          const parenthetical = match[1]?.trim();
          if (parenthetical) {
            sentences.push({
              paragraph,
              text: parenthetical,
              words: countSteWords(parenthetical),
            });
          }
        }
      }
    }
  }
  return sentences;
}

/** Counts ASD-STE100 words while treating identifiers, units, URLs, and quoted text as one word. */
export function countSteWords(text: string): number {
  const normalized = text
    .replace(/\([^()]*\)/gu, " PAREN ")
    .replace(/[“”"][^“”"\n]+[“”"]/gu, " QUOTE ")
    .replace(/\b(?:[\p{L}]\.){2,}/gu, " ABBR ")
    .replace(
      /\b\d+(?:\.\d+)?\s+(?:degrees\s+(?:Celsius|Fahrenheit)|%|°[CF]|[A-Za-z]{1,12})\b/gu,
      " UNIT ",
    )
    .replace(/`[^`\n]+`/gu, " CODE ")
    .replace(/https?:\/\/\S+/gu, " URL ");
  return normalized.match(/[\p{L}\p{N}]+(?:[._/:+-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

/** Returns the first English contraction because deterministic STE diagnostics report one example. */
export function contractionIn(text: string): string | null {
  return contractionPattern.exec(text)?.[0] ?? null;
}

/** Counts sentences per paragraph so separate topics do not share one limit. */
export function paragraphSentenceCounts(prose: CommentProse): number[] {
  const counts = Array.from({ length: prose.paragraphs.length }, () => 0);
  for (const sentence of sentencesOf(prose)) {
    counts[sentence.paragraph] = (counts[sentence.paragraph] ?? 0) + 1;
  }
  return counts;
}

/** Returns an adjacent comment because blank lines break its attachment to a declaration. */
export function directlyPrecedingComment(
  sourceCode: CommentSourceCode,
  node: AstNode,
): SourceComment | null {
  const comments = sourceCode.getCommentsBefore(node);
  const comment = comments.at(-1);
  const nodeLine = node.loc?.start.line;
  if (!comment || nodeLine === undefined || comment.loc.end.line < nodeLine - 1) {
    return null;
  }
  const prefix = sourceCode.lines[comment.loc.start.line - 1]?.slice(0, comment.loc.start.column);
  if (prefix?.trim()) {
    return null;
  }
  return comment;
}

/** Resolves documentation from either host because export wrappers can own the leading comment. */
export function commentsBeforeEither(
  sourceCode: CommentSourceCode,
  first: AstNode,
  second?: AstNode,
): SourceComment | null {
  return (
    directlyPrecedingComment(sourceCode, first) ??
    (second ? directlyPrecedingComment(sourceCode, second) : null)
  );
}

/** Extracts relative AGENTS.md anchors so the rule can validate durable guidance links. */
export function agentsReferences(text: string): AgentsReference[] {
  const references: AgentsReference[] = [];
  const pattern = /(?:^|[\s(])([^\s`()[\]]*AGENTS\.md)#([a-z0-9][a-z0-9-]*)/giu;
  for (const match of text.matchAll(pattern)) {
    references.push({ path: match[1]!, fragment: match[2]!.toLowerCase() });
  }
  return references;
}

function slugifyHeading(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/gu, "-");
}

function headingsIn(path: string): Set<string> | null {
  if (!existsSync(path)) {
    return null;
  }
  const headings = new Set<string>();
  const duplicates = new Map<string, number>();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const match = /^#{1,6}\s+(.+?)\s*#*$/u.exec(line);
    if (!match) {
      continue;
    }
    const base = slugifyHeading(match[1]!);
    const duplicate = duplicates.get(base) ?? 0;
    headings.add(duplicate === 0 ? base : `${base}-${duplicate}`);
    duplicates.set(base, duplicate + 1);
  }
  return headings;
}

/** Validates a referenced file and heading because stale guidance links hide required context. */
export function validateAgentsReference(
  filename: string,
  reference: AgentsReference,
): "missing-file" | "missing-heading" | null {
  const path = resolve(dirname(filename), reference.path);
  const headings = headingsIn(path);
  if (!headings) {
    return "missing-file";
  }
  return headings.has(reference.fragment) ? null : "missing-heading";
}

/** Walks Oxlint visitor keys so analysis remains correct when ESTree adds child fields. */
export function walkAst(
  node: AstNode,
  visitorKeys: VisitorKeys,
  visit: (node: AstNode) => void,
): void {
  visit(node);
  for (const key of visitorKeys[node.type] ?? []) {
    const value = Reflect.get(node, key);
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child !== null && Object(child) === child && Reflect.has(Object(child), "type")) {
          walkAst(child as AstNode, visitorKeys, visit);
        }
      }
    } else if (value !== null && Object(value) === value && Reflect.has(Object(value), "type")) {
      walkAst(value as AstNode, visitorKeys, visit);
    }
  }
}
