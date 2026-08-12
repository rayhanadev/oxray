import { describe, expect, test } from "bun:test";

import { mergeAgentsGuidance } from "../src/agents-guidance.ts";

describe("AGENTS.md guidance", () => {
  test("creates one managed section and remains idempotent", () => {
    const first = mergeAgentsGuidance("");

    expect(first).toContain("<!-- oxray:comments:start -->");
    expect(first).toContain("<!-- oxray:comments:start -->\n## Error handling");
    expect(first).toContain("Result.tryPromise");
    expect(first).toContain("## Comments and documentation");
    expect(first).toContain("## Responding to lint diagnostics");
    expect(first).toContain("`oxlint --fix-suggestions`");
    expect(mergeAgentsGuidance(first)).toBe(first);
  });

  test("preserves guidance outside the managed section", () => {
    const original = "# Project instructions\n\nUse Bun for scripts.\n";
    const merged = mergeAgentsGuidance(original);

    expect(merged).toStartWith(original);
    expect(merged).toContain("### Domain knowledge");
  });

  test("rejects duplicate or incomplete markers", () => {
    expect(() => mergeAgentsGuidance("<!-- oxray:comments:start -->\n")).toThrow(
      "duplicate or incomplete",
    );
    expect(() =>
      mergeAgentsGuidance(
        "<!-- oxray:comments:start -->\n<!-- oxray:comments:end -->\n<!-- oxray:comments:start -->\n<!-- oxray:comments:end -->\n",
      ),
    ).toThrow("duplicate or incomplete");
  });
});
