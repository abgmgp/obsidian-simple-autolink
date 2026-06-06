/**
 * Backfill aliases into target notes' frontmatter. Touches Obsidian APIs.
 *
 * When a link is created via a masterlist alias, the target note should learn
 * that alias so Obsidian's own link resolution and search pick it up. We only
 * ever ADD missing aliases, never remove or reorder, and we always go through
 * fileManager.processFrontMatter so YAML is written safely (build-plan §6).
 *
 * The pure decision of "what aliases need adding" is split out as
 * `aliasesToAdd` so it can be unit-tested without Obsidian.
 */

import { App, TFile } from "obsidian";
import { normalizeAliasField } from "./target-index";
import { Logger } from "../util/logger";

/**
 * Given a note's existing frontmatter aliases (raw value) and the aliases we
 * want present, return the subset that is missing. Comparison is case-sensitive
 * (frontmatter aliases are user-facing display strings). Pure.
 */
export function aliasesToAdd(existingRaw: unknown, wanted: string[]): string[] {
  const existing = new Set(normalizeAliasField(existingRaw));
  const missing: string[] = [];
  for (const a of wanted) {
    const t = a.trim();
    if (t === "" || existing.has(t)) continue;
    if (!missing.includes(t)) missing.push(t);
  }
  return missing;
}

/**
 * Ensure each path's wanted aliases are present in that file's frontmatter.
 * `wantedByPath` maps a vault path to the alias surface forms linked via that
 * note. Returns the number of files actually modified.
 */
export async function backfillAliases(
  app: App,
  wantedByPath: Map<string, Set<string>>,
  log: Logger,
): Promise<number> {
  let modified = 0;
  for (const [path, aliases] of wantedByPath) {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) continue;

    const cache = app.metadataCache.getFileCache(file);
    const missing = aliasesToAdd(cache?.frontmatter?.aliases, [...aliases]);
    if (missing.length === 0) continue;

    try {
      await app.fileManager.processFrontMatter(file, (fm) => {
        const current = normalizeAliasField(fm.aliases);
        // Re-check inside the transaction in case fm changed since the cache read.
        const toAdd = missing.filter((a) => !current.includes(a));
        if (toAdd.length === 0) return;
        fm.aliases = [...current, ...toAdd];
      });
      modified++;
      log.debug(`added aliases to ${path}: ${missing.join(", ")}`);
    } catch (err) {
      log.error(`failed to write aliases to ${path}`, err);
    }
  }
  return modified;
}
