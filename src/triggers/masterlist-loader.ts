/**
 * Loads and watches the alias masterlist file. Touches Obsidian APIs.
 *
 * Holds the parsed entries in memory, reloads when the configured file is
 * modified, created, renamed into place, or deleted. On delete we fall back to
 * an empty masterlist (frontmatter aliases still work) and notify once, per the
 * build-plan edge-case list.
 */

import { App, Notice, TAbstractFile, TFile } from "obsidian";
import {
  AliasEntry,
  parseMasterlist,
  mergeAliasEntries,
} from "../core/alias-masterlist";
import { Logger } from "../util/logger";

/** Last load outcome, for surfacing in the settings UI. */
export type MasterlistStatus =
  | { kind: "disabled" }
  | { kind: "not-found"; path: string }
  | { kind: "wrong-type"; path: string }
  | { kind: "loaded"; path: string; canonicals: number };

export class MasterlistLoader {
  private entries: AliasEntry[] = [];
  private problems: string[] = [];
  private notifiedMissing = false;
  private status: MasterlistStatus = { kind: "disabled" };

  constructor(
    private readonly app: App,
    private readonly getPath: () => string,
    private readonly onReload: () => void,
    private readonly log: Logger,
  ) {}

  getEntries(): AliasEntry[] {
    return this.entries;
  }

  getProblems(): string[] {
    return this.problems;
  }

  getStatus(): MasterlistStatus {
    return this.status;
  }

  /** True if a path equals the configured masterlist path. */
  isMasterlistPath(path: string): boolean {
    const configured = this.getPath().trim();
    return configured !== "" && path === configured;
  }

  /** Reload from the configured path. Safe to call when path is empty. */
  async reload(): Promise<void> {
    const path = this.getPath().trim();
    if (path === "") {
      this.set([], [], { kind: "disabled" });
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      if (!this.notifiedMissing) {
        new Notice("Auto-link: alias masterlist not found; using frontmatter aliases only.");
        this.notifiedMissing = true;
      }
      this.set([], [], { kind: "not-found", path });
      return;
    }
    // The masterlist must be a markdown file.
    if (file.extension !== "md") {
      this.set([], [], { kind: "wrong-type", path });
      return;
    }
    this.notifiedMissing = false;
    const text = await this.app.vault.cachedRead(file);
    const parsed = parseMasterlist(text);
    const merged = mergeAliasEntries(parsed.entries);
    this.set(merged, parsed.problems, {
      kind: "loaded",
      path,
      canonicals: merged.length,
    });
    this.log.debug(`masterlist loaded: ${this.entries.length} canonical(s)`);
  }

  /** Hook for vault modify/create/delete/rename events. */
  handleVaultEvent(file: TAbstractFile, oldPath?: string): void {
    if (this.isMasterlistPath(file.path) || (oldPath && this.isMasterlistPath(oldPath))) {
      void this.reload().then(() => this.onReload());
    }
  }

  private set(entries: AliasEntry[], problems: string[], status: MasterlistStatus): void {
    this.entries = entries;
    this.problems = problems;
    this.status = status;
  }
}
