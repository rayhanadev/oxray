import { describe, expect, test } from "bun:test";

import {
  agentsReferences,
  countSteWords,
  extractCommentProse,
  sentencesOf,
} from "../src/analysis/comments.ts";
import type { SourceComment } from "../src/rules/types.ts";

function sourceComment(value: string, type: SourceComment["type"] = "Line"): SourceComment {
  return {
    end: value.length,
    loc: {
      end: { column: value.length, line: 1 },
      start: { column: 0, line: 1 },
    },
    range: [0, value.length],
    start: 0,
    type,
    value,
  };
}

describe("ASD-STE100 comment analysis", () => {
  test("counts official special word forms as one word", () => {
    expect(countSteWords("The unit weighs 20 kilograms.")).toBe(4);
    expect(countSteWords("The temperature in the room is 10 degrees Celsius.")).toBe(7);
    expect(countSteWords("Run the check at 10 a.m.")).toBe(5);
    expect(countSteWords('Touch the "Service Overview" arrow.')).toBe(4);
    expect(countSteWords("Use request-id and 36L7.")).toBe(4);
  });

  test("counts parenthetical text in the outer and inner sentences", () => {
    const prose = extractCommentProse(
      sourceComment("Make sure that the EMER switch is released (the EMER legend is off)."),
    )!;
    const sentences = sentencesOf(prose);

    expect(sentences.map((sentence) => sentence.words)).toEqual([9, 5]);
  });

  test("keeps paragraph ownership and ignores structured examples", () => {
    const prose = extractCommentProse(
      sourceComment(
        "* Explains the contract.\n *\n * Adds a second paragraph.\n * @example\n * const value = build();",
        "Block",
      ),
    )!;

    expect(prose.paragraphs).toEqual(["Explains the contract.", "Adds a second paragraph."]);
    expect(sentencesOf(prose).map((sentence) => sentence.paragraph)).toEqual([0, 1]);
  });

  test("separates ordered list items and removes structured link syntax", () => {
    const prose = extractCommentProse(
      sourceComment(
        '* 1. Read the [retry policy][policy].\n * 2. Return a {@link Result} and say "do not retry".',
        "Block",
      ),
    )!;

    expect(prose.paragraphs).toEqual(["Read the retry policy.", "Return a CODE and say QUOTE ."]);
  });

  test("excludes legal text, directives, and ordinary commented code", () => {
    expect(extractCommentProse(sourceComment(" SPDX-License-Identifier: MIT"))).toBeNull();
    expect(extractCommentProse(sourceComment(" oxlint-disable-next-line no-console"))).toBeNull();
    expect(extractCommentProse(sourceComment(" const prior = load();"))).toBeNull();
  });

  test("extracts plain and Markdown AGENTS references without link labels", () => {
    expect(
      agentsReferences(
        "See ../../AGENTS.md#retry-policy and [the policy](../AGENTS.md#tool-contracts).",
      ),
    ).toEqual([
      { fragment: "retry-policy", path: "../../AGENTS.md" },
      { fragment: "tool-contracts", path: "../AGENTS.md" },
    ]);
  });
});
