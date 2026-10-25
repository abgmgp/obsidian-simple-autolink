import { App, TAbstractFile, TFile, EventRef } from "obsidian";
import { MatchIndex } from "../core/matcher";
import { linkContent, aliasesByTarget } from "../core/link-engine";
import { backfillAliases } from "../core/alias-writer";
import { AutoLinkSettings } from "../settings/settings";
import { Logger } from "../util/logger";

export interface OnFocusDeps {
  app: App;
  log: Logger;
  getSettings: () => AutoLinkSettings;
  getIndex: () => MatchIndex;
  inScope: (file: TFile) => boolean;
}

export class OnFocusTrigger {
  private readonly deps: OnFocusDeps;
  private eventRef: EventRef | null = null;
  private selfWrites = new Set<string>();

  constructor(deps: OnFocusDeps) {
    this.deps = deps;
  }

  enable(): void {
    if (this.eventRef) return;
    this.eventRef = this.deps.app.workspace.on("file-open", (file) => {
      if (file) void this.process(file);
    });
    this.deps.log.debug("on-focus trigger enabled");
  }

  dispose(): void {
    if (this.eventRef) {
      this.deps.app.workspace.offref(this.eventRef);
      this.eventRef = null;
    }
    this.selfWrites.clear();
    this.deps.log.debug("on-focus trigger disabled");
  }

  private async process(file: TAbstractFile): Promise<void> {
    if (!(file instanceof TFile) || file.extension !== "md") return;
    const settings = this.deps.getSettings();
    if (!settings.onFocus) return;
    if (!this.deps.inScope(file)) return;
    if (this.selfWrites.has(file.path)) return;

    try {
      const input = await this.deps.app.vault.read(file);
      const result = linkContent(input, file.path, this.deps.getIndex(), settings);
      if (!result.changed) return;

      this.selfWrites.add(file.path);
      try {
        await this.deps.app.vault.modify(file, result.content);
        this.deps.log.debug(`on-focus linked ${result.replacements.length} in ${file.path}`);
        if (settings.writeBackAliases) {
          const wanted = aliasesByTarget(result.replacements);
          if (wanted.size > 0) {
            for (const p of wanted.keys()) this.selfWrites.add(p);
            try {
              await backfillAliases(this.deps.app, wanted, this.deps.log);
            } finally {
              for (const p of wanted.keys()) window.setTimeout(() => this.selfWrites.delete(p), 0);
            }
          }
        }
      } finally {
        window.setTimeout(() => this.selfWrites.delete(file.path), 0);
      }
    } catch (err) {
      this.selfWrites.delete(file.path);
      this.deps.log.error(`on-focus failed for ${file.path}`, err);
    }
  }
}
