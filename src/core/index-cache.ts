/**
 * Lazy, invalidatable cache of the MatchIndex. Touches Obsidian only to read
 * the file list + frontmatter via target-index.
 *
 * The on-save trigger needs a current index on every fire but rebuilding on
 * each keystroke would be wasteful, so we build once and reuse until something
 * invalidates it (metadata change, rename, settings change).
 */

import { App, TFile } from "obsidian";
import { buildIndex } from "./target-index";
import { buildMatchIndex, MatchIndex } from "./matcher";
import { AliasEntry } from "./alias-masterlist";
import { AutoLinkSettings } from "../settings/settings";
import { Logger } from "../util/logger";

export type FileFilter = (file: TFile) => boolean;

export class IndexCache {
  private cached: MatchIndex | null = null;

  constructor(
    private readonly app: App,
    private readonly getSettings: () => AutoLinkSettings,
    private readonly getFilter: () => FileFilter,
    private readonly getMasterlist: () => AliasEntry[],
    private readonly log: Logger,
  ) {}

  /** Drop the cached index; next get() rebuilds. */
  invalidate(): void {
    this.cached = null;
  }

  /** Return the current index, rebuilding it if invalidated. */
  get(): MatchIndex {
    if (this.cached) return this.cached;
    const files = this.app.vault.getMarkdownFiles().filter(this.getFilter());
    const { entries, collisions, unresolved } = buildIndex(
      this.app,
      files,
      this.getSettings().normalize,
      this.getMasterlist(),
    );
    if (collisions.length > 0) {
      this.log.warn(`alias/title collisions (last write wins): ${collisions.join(", ")}`);
    }
    if (unresolved.length > 0) {
      this.log.warn(`masterlist canonicals with no matching note: ${unresolved.join(", ")}`);
    }
    this.cached = buildMatchIndex(entries);
    return this.cached;
  }
}
