/**
 * Detects inline domain and architecture markers that should live in AGENTS.md. Central guidance
 * keeps durable conventions visible to every file and leaves a short, validated `@see` link near
 * the affected code.
 *
 * @example
 * // INVARIANT: A scheduled message always has an occurrence identifier.
 *
 * The rule does not flag local implementation rationale or a valid relative AGENTS.md reference.
 */
import {
  agentsReferences,
  asCommentSource,
  extractCommentProse,
  validateAgentsReference,
} from "../analysis/comments.ts";
import type { OxlintRule } from "./types.ts";

const domainMarkerPattern = /\b(?:architecture|convention|domain|invariant)\s*:/iu;

const domainKnowledgeInAgents = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Move durable domain and architecture knowledge into AGENTS.md",
    },
    messages: {
      missingFile: "The AGENTS.md reference {{path}} does not resolve to a file.",
      missingHeading: "The AGENTS.md reference {{path}} has no #{{heading}} heading.",
      moveKnowledge:
        "Move this durable fact into AGENTS.md and replace it with `@see relative/AGENTS.md#heading`.",
    },
    schema: [],
  },
  create(context) {
    const sourceCode = asCommentSource(context.sourceCode);
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          const prose = extractCommentProse(comment);
          if (prose && domainMarkerPattern.test(prose.text)) {
            context.report({ loc: comment.loc, messageId: "moveKnowledge" });
          }
          for (const reference of agentsReferences(comment.value)) {
            const problem = validateAgentsReference(context.filename, reference);
            if (problem === "missing-file") {
              context.report({
                loc: comment.loc,
                messageId: "missingFile",
                data: { path: reference.path },
              });
            } else if (problem === "missing-heading") {
              context.report({
                loc: comment.loc,
                messageId: "missingHeading",
                data: { heading: reference.fragment, path: reference.path },
              });
            }
          }
        }
      },
    };
  },
} satisfies OxlintRule;

export default domainKnowledgeInAgents;
