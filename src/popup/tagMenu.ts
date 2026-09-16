import { Problem } from "../types/problem";
import { parseTagsInput } from "./tagsInput";

/**
 * Derives the sorted list of every distinct tag across the given problems.
 * Always computed from the currently loaded `Problem[]` — never hard-coded —
 * so it stays correct regardless of which problems happen to be synced.
 */
export function collectAllTags(problems: Problem[]): string[] {
  const seen = new Set<string>();
  for (const p of problems) {
    for (const tag of p.tags) seen.add(tag);
  }
  return Array.from(seen).sort();
}

/**
 * Toggles `tag` within a comma-separated tags input value, reusing
 * `parseTagsInput` so the toggle agrees with how the field is parsed
 * everywhere else: appends the tag if it isn't already present, removes it
 * if it is. The rest of the tags are preserved in their existing order.
 */
export function toggleTagInInput(value: string, tag: string): string {
  const current = parseTagsInput(value);
  const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
  return next.join(", ");
}

/**
 * Returns an updated "recent tags" list with `tags` moved to the front
 * (most-recently-used first), de-duplicated against the existing list, and
 * capped at `max` entries.
 */
export function addRecentTags(existing: string[], tags: string[], max = 8): string[] {
  const merged = [...tags, ...existing.filter((t) => !tags.includes(t))];
  return merged.slice(0, max);
}

/** The subset of an HTMLElement's API `isOutsideTagMenu` needs — kept minimal so it's easy to test without a DOM. */
export interface ClickContainer {
  contains(node: unknown): boolean;
}

/**
 * Decides whether a click on `target` should close the open tag menu. The
 * click counts as "inside" the tags control — and must NOT close the menu —
 * if it lands on the toggle button, inside the menu itself, or in the
 * manual tags input: typing into that input is using the same control as
 * the menu, not clicking away from it. Without excluding the input, opening
 * the menu and then clicking into the field to type manually would close
 * the menu on that very click, making the two impossible to use together.
 */
export function isOutsideTagMenu(
  target: unknown,
  tagMenu: ClickContainer,
  tagMenuToggle: ClickContainer,
  tagsInput: unknown
): boolean {
  return (
    target !== tagMenuToggle && target !== tagsInput && !tagMenu.contains(target) && !tagMenuToggle.contains(target)
  );
}
