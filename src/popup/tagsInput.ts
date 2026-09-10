/**
 * Parses a comma-separated tags input string into an array of trimmed,
 * non-empty tags. An empty/blank input yields `[]`, which the existing
 * filtering pipeline (`getProblems`/`getRandomProblemByFilter`) already
 * treats as "no tag filter" — so no further translation is needed here.
 */
export function parseTagsInput(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}
