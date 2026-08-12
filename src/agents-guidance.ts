/**
 * @fileoverview Maintains the Oxray-owned documentation policy in AGENTS.md.
 *
 * Managed markers protect project guidance because the scaffold replaces only the section that it
 * owns.
 */
const startMarker = "<!-- oxray:comments:start -->";
const endMarker = "<!-- oxray:comments:end -->";

const managedSection = `${startMarker}
## Comments and documentation

- Use JSDoc for exported functions and classes.
- Use JSDoc when a comment describes a function, class, method, accessor, or constructor.
- Explain constraints, side effects, failure behavior, or design reasons. Do not narrate the code.
- Use clear technical English that follows ASD-STE100 principles.
- Keep descriptive sentences at 25 words or fewer.
- Keep procedural sentences at 20 words or fewer.
- Use active voice and simple verb tenses.
- Keep each paragraph to one topic and six sentences or fewer.

### File overviews

Add a leading \`@fileoverview\` JSDoc block when a module has a broad API or complex control flow.
Explain the module boundary and the important flow. Do not list the exports.

### Domain knowledge

Put durable business rules, architecture decisions, invariants, and shared terminology in the nearest AGENTS.md.
Use a relative JSDoc reference such as \`@see ../../AGENTS.md#retry-policy\` near the affected code.
Maintain one project glossary for preferred domain terms when several names could describe the same concept.

### Comment exceptions

If the project permits suppressions, use only rule-specific \`disable-line\` or \`disable-next-line\` directives.
Add the \`--\` delimiter and a clear rationale of at least five words to each lint suppression.
Delete commented-out implementation code or move it to a JSDoc example.
If disabled code must remain, add \`KEPT: <reason>\` immediately before it.

If the ASD-STE100 skill is available, use it when you write or revise substantial documentation.

## Responding to lint diagnostics

- Apply the exact replacement when a diagnostic provides one.
- Run \`oxlint --fix\` for corrections that preserve runtime behavior.
- Review each change before you run \`oxlint --fix-suggestions\`.
- Replace diagnostic placeholders with project-specific names and types.
- Run Oxfmt and Oxlint after each correction.
${endMarker}`;

function occurrences(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

/** Updates only the managed section because projects can keep independent guidance around it. */
export function mergeAgentsGuidance(text: string): string {
  const starts = occurrences(text, startMarker);
  const ends = occurrences(text, endMarker);
  if (starts !== ends || starts > 1) {
    throw new Error("AGENTS.md has duplicate or incomplete Oxray comment markers");
  }
  if (starts === 1) {
    const start = text.indexOf(startMarker);
    const end = text.indexOf(endMarker, start) + endMarker.length;
    return `${text.slice(0, start)}${managedSection}${text.slice(end)}`;
  }
  if (text.trim().length === 0) {
    return `${managedSection}\n`;
  }
  const separator = text.endsWith("\n") ? "\n" : "\n\n";
  return `${text}${separator}${managedSection}\n`;
}
