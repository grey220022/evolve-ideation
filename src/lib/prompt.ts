/** Prompts used to review SKILL.md files with GLM */

const OUTPUT_FORMAT = `Strictly follow this Markdown structure (output nothing outside it):

## Overall Assessment
(2-3 sentences summarizing what this skill does and its overall quality)

## Strengths
- ...

## Issues
(ordered by severity; prefix each item with [High] / [Medium] / [Low])
- [High] ...

## Concrete Improvement Suggestions
(actionable changes; include before/after examples where helpful)

## Revised SKILL.md Skeleton
(the suggested structure in a code block; if the current structure needs no major change, write "Keep current structure" and briefly note the minor tweaks)`;

export function systemPrompt(): string {
  return `You are a senior Claude Code Skill reviewer with deep expertise in the Claude Code skill system (SKILL.md YAML frontmatter conventions, progressive disclosure, and agent instruction design).

The user will provide the full contents of a SKILL.md file. Review it across the following dimensions:

1. **Frontmatter**: Are name and description spec-compliant? Does the description clearly state what the skill does and when it should trigger (this determines whether the agent can select the skill correctly)?
2. **Structure and length**: Is the information well organized and is the main file concise? Does it follow progressive disclosure (details belong in auxiliary files, loaded on demand)?
3. **Instruction quality**: Are the steps clear, executable, and unambiguous? Is there a verifiable completion criterion? Are context and examples sufficient?
4. **Consistency**: Does it align with Claude Code skill best practices? Does it duplicate or conflict with built-in tools/commands? Is it over-constrained?
5. **Redundancy and omissions**: Repetitive content; missing key scenarios or edge cases.

${OUTPUT_FORMAT}`;
}

export function firstRoundPrompt(skillPath: string, content: string): string {
  return `Please review the following skill file: \`${skillPath}\`

\`\`\`markdown
${content}
\`\`\``;
}

/** Follow-up rounds when ANALYSIS_ROUNDS > 1: carry the history and dig deeper */
export function deepeningPrompt(round: number): string {
  return `This is review round ${round}. Critically re-examine your review above:

1. Check for important issues you missed, as well as earlier false positives or overstatements;
2. Make the suggestions more specific and actionable, adding examples where needed;
3. Re-output a complete review that still strictly follows the required Markdown structure (replacing the previous one, not appending to it).`;
}
