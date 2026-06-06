/**
 * On-save (modify) auto-link trigger. Touches Obsidian APIs.
 *
 * Subscribes to vault 'modify' and, per file, debounces 300ms before running
 * the link engine on that single file. Two layers stop the infinite-loop risk
 * the build plan calls out:
 *
 *  1. Re-entrancy guard: paths we are actively writing are recorded in
 *     `selfWrites`. The 'modify' event our own vault.modify fires is ignored
 *     while the path is in that set.
 *  2. Content-equality: the link engine reports `changed: false` when applying
 *     links is a no-op (e.g. everything is already linked), so we never write
 *     identical content back.
 *
 * The index is supplied lazily by the host (it owns caching/invalidation), so
 * this module stays a thin, replaceable trigger.
 */

import { App, TAbstractFile, TFile, debounce, Debouncer, EventRef } from "obsidian";
import { MatchIndex } from "../core/matcher";
import { linkContent, aliasesByTarget } from "../core/link-engine";
import { backfillAliases } from "../core/alias-writer";
import { AutoLinkSettings } from "../settings/settings";
import { Logger } from "../util/logger";

const DEBOUNCE_MS = 300;

export interface OnSaveDeps {
  app: App;
  log: Logger;
  /** Current settings (read fresh on each fire so toggles take effect live). */
  getSettings: () => AutoLinkSettings;
  /** Resolve the current match index (host owns building/caching it). */
  getIndex: () => MatchIndex;
  /** Whether a given file is in scope (include/exclude filtering). */
  inScope: (file: TFile) => boolean;
}

/**
 * Manages the modify subscription and per-file debouncers. Construct on enable,
 * call dispose() on disable/unload.
 */
export class OnSaveTrigger {
  private readonly deps: OnSaveDeps;
  private eventRef: EventRef | null = null;
  /** Per-path debouncers so edits to different files don't cancel each other. */
  private debouncers = new Map<string, Debouncer<[TFile], void>>();
  /** Paths we are currently writing — used to ignore our own modify events. */
  private selfWrites = new Set<string>();

  constructor(deps: OnSaveDeps) {
    this.deps = deps;
  }

  enable(): void {
    if (this.eventRef) return;
    this.eventRef = this.deps.app.vault.on("modify", (file) => this.onModify(file));
    this.deps.log.debug("on-save trigger enabled");
  }

  dispose(): void {
    if (this.eventRef) {
      this.deps.app.vault.offref(this.eventRef);
      this.eventRef = null;
    }
    this.debouncers.clear();
    this.selfWrites.clear();
    this.deps.log.debug("on-save trigger disabled");
  }

  private onModify(file: TAbstractFile): void {
    if (!(file instanceof TFile) || file.extension !== "md") return;
    // Ignore the modify event triggered by our own write.
    if (this.selfWrites.has(file.path)) return;
    if (!this.deps.inScope(file)) return;

    let debouncer = this.debouncers.get(file.path);
    if (!debouncer) {
      debouncer = debounce(
        (f: TFile) => {
          void this.process(f);
        },
        DEBOUNCE_MS,
        true,
      );
      this.debouncers.set(file.path, debouncer);
    }
    debouncer(file);
  }

  private async process(file: TFile): Promise<void> {
    const settings = this.deps.getSettings();
    // Setting may have been toggled off after the debounce was scheduled.
    if (!settings.onSave) return;

    try {
      const input = await this.deps.app.vault.read(file);
      const result = linkContent(input, file.path, this.deps.getIndex(), settings);
      if (!result.changed) return;

      this.selfWrites.add(file.path);
      try {
        await this.deps.app.vault.modify(file, result.content);
        this.deps.log.debug(
          `on-save linked ${result.replacements.length} in ${file.path}`,
        );

        // Backfill masterlist aliases into the target notes' frontmatter.
        if (settings.writeBackAliases) {
          const wanted = aliasesByTarget(result.replacements);
          if (wanted.size > 0) {
            // Guard the target paths too so their processFrontMatter writes
            // don't bounce back through on-save.
            for (const p of wanted.keys()) this.selfWrites.add(p);
            try {
              await backfillAliases(this.deps.app, wanted, this.deps.log);
            } finally {
              for (const p of wanted.keys()) {
                setTimeout(() => this.selfWrites.delete(p), 0);
              }
            }
          }
        }
      } finally {
        // Release after the write settles so the resulting modify event,
        // which is dispatched asynchronously, still sees the guard.
        setTimeout(() => this.selfWrites.delete(file.path), 0);
      }
    } catch (err) {
      this.selfWrites.delete(file.path);
      this.deps.log.error(`on-save failed for ${file.path}`, err);
    }
  }
}
