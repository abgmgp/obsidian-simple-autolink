/**
 * Glue between the index and the matcher for a single file's content.
 * Pure — zero Obsidian imports — so the whole link pipeline is unit-testable
 * and reused by both the full-vault and on-save triggers.
 */

import {
  MatchIndex,
  findReplacements,
  applyReplacements,
  Replacement,
} from "./matcher";
import { computeSkipRanges } from "./text-segmenter";
import { AutoLinkSettings } from "../settings/settings";

export interface LinkResult {
  /** The new content (=== input when no changes were made). */
  content: string;
  /** Whether any replacement was applied. */
  changed: boolean;
  replacements: Replacement[];
}

/**
 * Apply auto-linking to one file's content. `sourcePath` drives the
 * self-reference guard. Returns the same string instance semantics callers
 * rely on for change detection (changed === content !== input).
 */
export function linkContent(
  input: string,
  sourcePath: string,
  index: MatchIndex,
  settings: AutoLinkSettings,
): LinkResult {
  // Tables are always skipped: the alias `|` in `[[Canonical|surface]]`
  // collides with the GFM cell separator, breaking both the link and the
  // table. Force `tables: true` regardless of any stale persisted value.
  const skips = computeSkipRanges(input, { ...settings.skip, tables: true });
  const replacements = findReplacements(input, index, skips, {
    normalize: settings.normalize,
    oneLinkPerFile: settings.oneLinkPerFile,
    sourcePath,
  });
  if (replacements.length === 0) {
    return { content: input, changed: false, replacements: [] };
  }
  const content = applyReplacements(input, replacements);
  return { content, changed: content !== input, replacements };
}

/**
 * From a set of replacements, collect the alias surface forms that were linked
 * via an alias, grouped by target file path. Used to backfill frontmatter
 * `aliases:` on the target notes. Pure.
 */
export function aliasesByTarget(replacements: Replacement[]): Map<string, Set<string>> {
  const byPath = new Map<string, Set<string>>();
  for (const r of replacements) {
    const alias = r.target.alias;
    if (!alias) continue;
    let set = byPath.get(r.target.path);
    if (!set) {
      set = new Set<string>();
      byPath.set(r.target.path, set);
    }
    set.add(alias);
  }
  return byPath;
}
