import { Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { Logger } from "./util/logger";
import { MASTERLIST_TEMPLATE } from "./core/alias-masterlist";
import { AutoLinkSettings, DEFAULT_SETTINGS } from "./settings/settings";
import { runFullVault } from "./triggers/full-vault";
import { OnSaveTrigger } from "./triggers/on-save";
import { IndexCache } from "./core/index-cache";
import { MasterlistLoader } from "./triggers/masterlist-loader";
import { AutoLinkSettingTab } from "./settings/settings-tab";
import { isInScope } from "./util/glob";

export default class AutoLinkPlugin extends Plugin {
  private log = new Logger("info");
  settings: AutoLinkSettings = DEFAULT_SETTINGS;
  /** Guards against overlapping full-vault runs. */
  private running = false;
  private indexCache!: IndexCache;
  private onSave!: OnSaveTrigger;
  private masterlist!: MasterlistLoader;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.log.info(`loaded v${this.manifest.version}`);

    this.masterlist = new MasterlistLoader(
      this.app,
      // Effective path is empty (disabled) unless the feature is toggled on.
      () => (this.settings.masterlistEnabled ? this.settings.masterlistPath : ""),
      () => this.indexCache.invalidate(),
      this.log,
    );

    this.indexCache = new IndexCache(
      this.app,
      () => this.settings,
      () => this.fileFilter,
      () => this.masterlist.getEntries(),
      this.log,
    );

    this.onSave = new OnSaveTrigger({
      app: this.app,
      log: this.log,
      getSettings: () => this.settings,
      getIndex: () => this.indexCache.get(),
      inScope: (file) => this.fileFilter(file),
    });

    this.addRibbonIcon("link", "Auto-link: scan whole vault", () => {
      void this.scanVault();
    });

    this.addCommand({
      id: "scan-whole-vault",
      name: "Scan whole vault",
      callback: () => {
        void this.scanVault();
      },
    });

    this.addSettingTab(new AutoLinkSettingTab(this.app, this));

    // Keep the cached index fresh when the vault's notes/metadata change.
    // 'resolved' fires after a batch settles; 'changed' fires per-file when a
    // note's frontmatter (e.g. its aliases) updates.
    this.registerEvent(this.app.metadataCache.on("resolved", () => this.indexCache.invalidate()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.indexCache.invalidate()));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => {
      this.indexCache.invalidate();
      this.masterlist.handleVaultEvent(f, oldPath);
    }));
    this.registerEvent(this.app.vault.on("delete", (f) => {
      this.indexCache.invalidate();
      this.masterlist.handleVaultEvent(f);
    }));
    this.registerEvent(
      this.app.vault.on("modify", (f: TAbstractFile) => this.masterlist.handleVaultEvent(f)),
    );
    this.registerEvent(
      this.app.vault.on("create", (f: TAbstractFile) => this.masterlist.handleVaultEvent(f)),
    );

    // Load the masterlist and apply the on-save toggle once the workspace is ready.
    this.app.workspace.onLayoutReady(() => {
      void this.masterlist.reload();
      this.applyOnSaveSetting();
    });
  }

  onunload(): void {
    this.onSave?.dispose();
    this.log.info("unloaded");
  }

  /** Include/exclude filter driven by the path globs in settings. */
  private fileFilter = (file: TFile): boolean =>
    isInScope(file.path, this.settings.includeGlobs, this.settings.excludeGlobs);

  /** Enable or disable the on-save trigger to match the current setting. */
  applyOnSaveSetting(): void {
    if (this.settings.onSave) {
      this.onSave.enable();
    } else {
      this.onSave.dispose();
    }
  }

  private async scanVault(): Promise<void> {
    if (this.running) {
      this.log.warn("full-vault run already in progress; ignoring");
      return;
    }
    this.running = true;
    try {
      await runFullVault(this.app, this.settings, this.log, {
        filter: this.fileFilter,
        masterlist: this.masterlist.getEntries(),
      });
      this.indexCache.invalidate();
    } catch (err) {
      this.log.error("full-vault run failed", err);
    } finally {
      this.running = false;
    }
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<AutoLinkSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      // Deep-merge nested objects so new keys from defaults survive old data.
      normalize: { ...DEFAULT_SETTINGS.normalize, ...saved?.normalize },
      skip: { ...DEFAULT_SETTINGS.skip, ...saved?.skip },
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    await this.masterlist.reload();
    this.indexCache.invalidate();
    this.applyOnSaveSetting();
  }

  /** Problems from the last masterlist parse, for the settings tab to surface. */
  getMasterlistProblems(): string[] {
    return this.masterlist.getProblems();
  }

  /** Last masterlist load outcome, for the settings tab to surface. */
  getMasterlistStatus() {
    return this.masterlist.getStatus();
  }

  /**
   * Create a template masterlist file at the configured path. Refuses if a file
   * already exists there (the user must pick a new path). Returns true on
   * creation. Opens the new file so the user can edit it.
   */
  async createMasterlistTemplate(): Promise<boolean> {
    const path = this.settings.masterlistPath.trim();
    if (path === "") {
      new Notice("Auto-link: set a masterlist file path first.");
      return false;
    }
    if (!path.toLowerCase().endsWith(".md")) {
      new Notice("Auto-link: masterlist path must end in .md");
      return false;
    }
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(`Auto-link: "${path}" already exists. Choose a different path.`);
      return false;
    }
    try {
      const file = await this.app.vault.create(path, MASTERLIST_TEMPLATE);
      new Notice(`Auto-link: created masterlist at "${path}".`);
      await this.masterlist.reload();
      this.indexCache.invalidate();
      void this.app.workspace.getLeaf(false).openFile(file);
      return true;
    } catch (err) {
      this.log.error("failed to create masterlist template", err);
      new Notice("Auto-link: failed to create masterlist (see console).");
      return false;
    }
  }
}
