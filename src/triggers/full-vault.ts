/**
 * Manual full-vault auto-link run. Touches Obsidian APIs.
 *
 * Builds the target index, iterates every markdown file, applies the pure link
 * engine, and writes changed files back via vault.modify. Yields to the event
 * loop periodically so the UI (especially mobile) stays responsive.
 */

import { App, Notice, TFile } from "obsidian";
import { buildIndex } from "../core/target-index";
import { buildMatchIndex } from "../core/matcher";
import { linkContent, aliasesByTarget } from "../core/link-engine";
import { backfillAliases } from "../core/alias-writer";
import { AliasEntry } from "../core/alias-masterlist";
import { AutoLinkSettings } from "../settings/settings";
import { Logger } from "../util/logger";

/** Yield to the event loop every N files so the UI can paint. */
const CHUNK_SIZE = 50;

export interface RunSummary {
  scanned: number;
  changed: number;
  links: number;
  aliasNotesUpdated: number;
  collisions: string[];
}

/** A predicate the caller supplies for include/exclude filtering. */
export type FileFilter = (file: TFile) => boolean;

export interface FullVaultOptions {
  filter?: FileFilter;
  /** Masterlist alias entries to layer into the index. */
  masterlist?: AliasEntry[];
}

export async function runFullVault(
  app: App,
  settings: AutoLinkSettings,
  log: Logger,
  options: FullVaultOptions = {},
): Promise<RunSummary> {
  const filter = options.filter ?? (() => true);
  const allFiles = app.vault.getMarkdownFiles().filter(filter);

  // Index targets from the (filtered) file set so excluded notes aren't targets.
  const { entries, collisions, unresolved } = buildIndex(
    app,
    allFiles,
    settings.normalize,
    options.masterlist ?? [],
  );
  const index = buildMatchIndex(entries);
  if (collisions.length > 0) {
    log.warn(`alias/title collisions (last write wins): ${collisions.join(", ")}`);
  }
  if (unresolved.length > 0) {
    log.warn(`masterlist canonicals with no matching note: ${unresolved.join(", ")}`);
  }

  const notice = new Notice("Auto-link: scanning…", 0);
  const summary: RunSummary = {
    scanned: 0,
    changed: 0,
    links: 0,
    aliasNotesUpdated: 0,
    collisions,
  };
  // Accumulate aliases to backfill across the whole run, then write once each.
  const aliasBackfill = new Map<string, Set<string>>();

  try {
    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      summary.scanned++;

      const input = await app.vault.cachedRead(file);
      const result = linkContent(input, file.path, index, settings);
      if (result.changed) {
        await app.vault.modify(file, result.content);
        summary.changed++;
        summary.links += result.replacements.length;
        if (settings.writeBackAliases) {
          mergeInto(aliasBackfill, aliasesByTarget(result.replacements));
        }
      }

      if (i % CHUNK_SIZE === 0) {
        notice.setMessage(`Auto-link: ${i + 1}/${allFiles.length}…`);
        await yieldToEventLoop();
      }
    }

    if (aliasBackfill.size > 0) {
      summary.aliasNotesUpdated = await backfillAliases(app, aliasBackfill, log);
    }
  } finally {
    notice.hide();
  }

  new Notice(
    `Auto-link: ${summary.links} link(s) across ${summary.changed} of ${summary.scanned} note(s).`,
  );
  log.info("full-vault run complete", summary);
  return summary;
}

function mergeInto(target: Map<string, Set<string>>, source: Map<string, Set<string>>): void {
  for (const [path, set] of source) {
    const existing = target.get(path);
    if (existing) {
      for (const a of set) existing.add(a);
    } else {
      target.set(path, new Set(set));
    }
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
