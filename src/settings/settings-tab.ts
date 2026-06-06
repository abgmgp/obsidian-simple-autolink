/**
 * Settings tab UI. Touches Obsidian APIs (PluginSettingTab, Setting).
 *
 * Every control maps directly onto AutoLinkSettings and persists via the
 * plugin's saveSettings(), which also invalidates the index cache and applies
 * the on-save toggle so changes take effect immediately.
 *
 * Rendered imperatively via display() — the pre-1.13.0 pattern documented at
 * https://docs.obsidian.md/Plugins/User+interface/Settings. The declarative
 * getSettingDefinitions() API requires Obsidian 1.13.0, newer than our declared
 * minAppVersion, so we deliberately use display() here. display() is deprecated
 * since 1.13.0 but remains fully supported.
 */

import { App, PluginSettingTab, Setting } from "obsidian";
import type AutoLinkPlugin from "../main";
import { MarkdownFileSuggest } from "./file-suggest";

export class AutoLinkSettingTab extends PluginSettingTab {
  private readonly plugin: AutoLinkPlugin;
  /** Container for the masterlist status line, refreshed in place. */
  private statusEl: HTMLElement | null = null;

  constructor(app: App, plugin: AutoLinkPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    new Setting(containerEl).setName("Matching").setHeading();

    new Setting(containerEl)
      .setName("Case sensitive")
      .setDesc("Keywords only links notes that exactly match their own type case.")
      .addToggle((t) =>
        t.setValue(!s.normalize.caseInsensitive).onChange(async (v) => {
          s.normalize.caseInsensitive = !v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Match base form")
      .setDesc(
        "Link simple plurals to their singular note. Turn off if you experience over-linking.",
      )
      .addToggle((t) =>
        t.setValue(s.normalize.matchBaseForm).onChange(async (v) => {
          s.normalize.matchBaseForm = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("One link per file")
      .setDesc("Link each target note only once per file.")
      .addToggle((t) =>
        t.setValue(s.oneLinkPerFile).onChange(async (v) => {
          s.oneLinkPerFile = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Skip elements")
      .setDesc("Smart matching will never trigger inside these Markdown elements:")
      .setHeading();

    this.skipToggle(containerEl, "Headings", "headings");
    this.skipToggle(containerEl, "Tables", "tables");
    // The remaining skip elements (code, links, frontmatter, math) are always
    // skipped for safety and are not user-configurable to prevent corruption.

    new Setting(containerEl).setName("Triggers").setHeading();

    new Setting(containerEl)
      .setName("Link on save")
      .setDesc("Run auto-link automatically when a note is modified.")
      .addToggle((t) =>
        t.setValue(s.onSave).onChange(async (v) => {
          s.onSave = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).setName("Paths").setHeading();

    new Setting(containerEl)
      .setName("Include folders")
      .setDesc(
        "One path per line. If empty, the whole vault is scanned. Examples: 'Concepts', 'projects/**'.",
      )
      .addTextArea((ta) => {
        ta.setValue(s.includeGlobs.join("\n")).onChange(async (v) => {
          s.includeGlobs = splitLines(v);
          await this.plugin.saveSettings();
        });
        ta.inputEl.rows = 4;
      });

    new Setting(containerEl)
      .setName("Exclude folders")
      .setDesc(
        "One path per line. Excluded notes are not scanned and never used as link targets. Exclude takes priority over include.",
      )
      .addTextArea((ta) => {
        ta.setValue(s.excludeGlobs.join("\n")).onChange(async (v) => {
          s.excludeGlobs = splitLines(v);
          await this.plugin.saveSettings();
        });
        ta.inputEl.rows = 4;
      });

    new Setting(containerEl)
      .setName("Alias masterlist")
      .setDesc(
        "One mapping per line. Format: 'Note name: alias1, alias2'. Aliases link to the note and are added to its property on first link.",
      )
      .setHeading();

    new Setting(containerEl)
      .setName("Use alias masterlist")
      .setDesc("Turn the alias masterlist configuration on or off.")
      .addToggle((t) =>
        t.setValue(s.masterlistEnabled).onChange(async (v) => {
          s.masterlistEnabled = v;
          await this.plugin.saveSettings();
          this.display(); // show/hide the dependent controls
        }),
      );

    // The remaining masterlist controls only apply when the feature is on.
    if (s.masterlistEnabled) {
      new Setting(containerEl)
        .setName("Masterlist file path")
        .setDesc(
          "Vault-relative path to a markdown (.md) file. Supports only markdown files. Enter a new path (e.g. 'alias-master.md') and click create if no masterfile exists yet.",
        )
        .addSearch((search) => {
          search
            .setPlaceholder("Meta/aliases.md")
            .setValue(s.masterlistPath)
            .onChange(async (v) => {
              s.masterlistPath = v.trim();
              await this.plugin.saveSettings();
              this.refreshMasterlistStatus();
            });
          new MarkdownFileSuggest(this.app, search.inputEl, (path) => {
            s.masterlistPath = path;
            void this.plugin.saveSettings().then(() => this.display());
          });
        });

      // Validity status sits directly under the path field it reflects.
      this.statusEl = containerEl.createDiv();
      this.renderMasterlistStatus();

      new Setting(containerEl)
        .setName("Create masterlist template")
        .setDesc(
          "Create a new, pre-filled masterlist file at the path above.",
        )
        .addButton((b) =>
          b
            .setButtonText("Create template")
            .setCta()
            .onClick(async () => {
              const created = await this.plugin.createMasterlistTemplate();
              if (created) this.display();
            }),
        );

      new Setting(containerEl)
        .setName("Write aliases back to notes")
        .setDesc(
          "When a note is linked via a masterlist alias, add that alias to the target note's alias property if missing.",
        )
        .addToggle((t) =>
          t.setValue(s.writeBackAliases).onChange(async (v) => {
            s.writeBackAliases = v;
            await this.plugin.saveSettings();
          }),
        );

      const problems = this.plugin.getMasterlistProblems();
      if (s.masterlistPath.trim() !== "" && problems.length > 0) {
        const box = containerEl.createDiv({ cls: "setting-item-description" });
        box.createEl("p", { text: `Masterlist issues (${problems.length}):` });
        const ul = box.createEl("ul");
        for (const p of problems) ul.createEl("li", { text: p });
      }
    }
  }

  /** Rebuild just the status line in place (avoids a full re-render on typing). */
  private refreshMasterlistStatus(): void {
    if (this.statusEl) this.renderMasterlistStatus();
  }

  /** Show whether the configured masterlist path resolved and loaded. */
  private renderMasterlistStatus(): void {
    const el = this.statusEl;
    if (!el) return;
    el.empty();

    const status = this.plugin.getMasterlistStatus();
    if (status.kind === "disabled") return;

    let message: string;
    if (status.kind === "not-found") {
      message = `⚠ No file found at "${status.path}". Use "Create template" or pick an existing file.`;
    } else if (status.kind === "wrong-type") {
      message = `⚠ "${status.path}" is not supported.`;
    } else {
      message = `✓ Loaded ${status.canonicals} record/s from "${status.path}".`;
    }

    // Render as a Setting row so the indicator shares the same horizontal
    // alignment (left padding) as every other control in the tab.
    new Setting(el).setName(message);
  }

  private skipToggle(
    containerEl: HTMLElement,
    name: string,
    key: keyof typeof this.plugin.settings.skip,
  ): void {
    new Setting(containerEl).setName(name).addToggle((t) =>
      t.setValue(this.plugin.settings.skip[key]).onChange(async (v) => {
        this.plugin.settings.skip[key] = v;
        await this.plugin.saveSettings();
      }),
    );
  }
}

/** Split a textarea value into trimmed, non-empty lines. */
function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}
