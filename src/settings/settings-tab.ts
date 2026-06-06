/**
 * Settings tab UI. Touches Obsidian APIs (PluginSettingTab, Setting).
 *
 * Every control maps directly onto AutoLinkSettings and persists via the
 * plugin's saveSettings(), which also invalidates the index cache and applies
 * the on-save toggle so changes take effect immediately.
 *
 * Rendered declaratively via getSettingDefinitions() (Obsidian 1.13.0+). Each
 * control is expressed through a `render` callback so it keeps full control of
 * its Setting; conditional rows use `visible` predicates and re-evaluate when
 * we call update().
 *
 * For Obsidian versions older than 1.13.0 — which never call
 * getSettingDefinitions() — display() is implemented as a fallback that walks
 * those same definitions and renders them imperatively. The definitions stay
 * the single source of truth for both paths.
 */

import {
  App,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
  type SettingGroupItem,
} from "obsidian";
import type AutoLinkPlugin from "../main";
import { MarkdownFileSuggest } from "./file-suggest";

export class AutoLinkSettingTab extends PluginSettingTab {
  private readonly plugin: AutoLinkPlugin;

  constructor(app: App, plugin: AutoLinkPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const s = this.plugin.settings;

    return [
      {
        type: "group",
        heading: "Matching",
        items: [
          {
            name: "Case sensitive",
            desc: "Keywords only links notes that exactly match their own type case.",
            render: (setting) => {
              setting.addToggle((t) =>
                t.setValue(!s.normalize.caseInsensitive).onChange(async (v) => {
                  s.normalize.caseInsensitive = !v;
                  await this.plugin.saveSettings();
                }),
              );
            },
          },
          {
            name: "Match base form",
            desc: "Link simple plurals to their singular note. Turn off if you experience over-linking.",
            render: (setting) => {
              setting.addToggle((t) =>
                t.setValue(s.normalize.matchBaseForm).onChange(async (v) => {
                  s.normalize.matchBaseForm = v;
                  await this.plugin.saveSettings();
                }),
              );
            },
          },
          {
            name: "One link per file",
            desc: "Link each target note only once per file.",
            render: (setting) => {
              setting.addToggle((t) =>
                t.setValue(s.oneLinkPerFile).onChange(async (v) => {
                  s.oneLinkPerFile = v;
                  await this.plugin.saveSettings();
                }),
              );
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Skip elements",
        items: [
          {
            name: "Skip elements",
            desc: "Smart matching will never trigger inside these markdown elements:",
            render: () => {
              /* heading-only row; description rendered by the framework */
            },
          },
          this.skipDefinition("Headings", "headings"),
          this.skipDefinition("Tables", "tables"),
          // The remaining skip elements (code, links, frontmatter, math) are
          // always skipped for safety and are not user-configurable to prevent
          // corruption.
        ],
      },
      {
        type: "group",
        heading: "Triggers",
        items: [
          {
            name: "Link on save",
            desc: "Run auto-link automatically when a note is modified.",
            render: (setting) => {
              setting.addToggle((t) =>
                t.setValue(s.onSave).onChange(async (v) => {
                  s.onSave = v;
                  await this.plugin.saveSettings();
                }),
              );
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Paths",
        items: [
          {
            name: "Include folders",
            desc: "One path per line. If empty, the whole vault is scanned. Examples: 'Concepts', 'Projects/**'.",
            render: (setting) => {
              setting.addTextArea((ta) => {
                ta.setValue(s.includeGlobs.join("\n")).onChange(async (v) => {
                  s.includeGlobs = splitLines(v);
                  await this.plugin.saveSettings();
                });
                ta.inputEl.rows = 4;
              });
            },
          },
          {
            name: "Exclude folders",
            desc: "One path per line. Excluded notes are not scanned and never used as link targets. Exclude takes priority over include.",
            render: (setting) => {
              setting.addTextArea((ta) => {
                ta.setValue(s.excludeGlobs.join("\n")).onChange(async (v) => {
                  s.excludeGlobs = splitLines(v);
                  await this.plugin.saveSettings();
                });
                ta.inputEl.rows = 4;
              });
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Alias masterlist",
        items: [
          {
            name: "Use alias masterlist",
            desc: "Turn the alias masterlist configuration on or off.",
            render: (setting) => {
              setting.addToggle((t) =>
                t.setValue(s.masterlistEnabled).onChange(async (v) => {
                  s.masterlistEnabled = v;
                  await this.plugin.saveSettings();
                  this.rerender(); // show/hide the dependent controls
                }),
              );
            },
          },
          // The remaining masterlist controls only apply when the feature is on.
          {
            name: "Masterlist file path",
            desc: "Vault-relative path to a markdown (.md) file. Supports only markdown files. Enter a new path (e.g. 'alias-master.md') and click create if no masterfile exists yet.",
            visible: () => s.masterlistEnabled,
            render: (setting) => {
              setting.addSearch((search) => {
                search
                  .setPlaceholder("Meta/aliases.md")
                  .setValue(s.masterlistPath)
                  .onChange(async (v) => {
                    s.masterlistPath = v.trim();
                    await this.plugin.saveSettings();
                    this.rerender();
                  });
                new MarkdownFileSuggest(this.app, search.inputEl, (path) => {
                  s.masterlistPath = path;
                  void this.plugin.saveSettings().then(() => this.rerender());
                });
              });
            },
          },
          {
            // Validity status sits directly under the path field it reflects.
            name: "Masterlist status",
            searchable: false,
            visible: () => s.masterlistEnabled,
            render: (setting) => {
              this.renderMasterlistStatus(setting);
            },
          },
          {
            name: "Create masterlist template",
            desc: "Create a new, pre-filled masterlist file at the path above.",
            visible: () => s.masterlistEnabled,
            render: (setting) => {
              setting.addButton((b) =>
                b
                  .setButtonText("Create template")
                  .setCta()
                  .onClick(async () => {
                    const created = await this.plugin.createMasterlistTemplate();
                    if (created) this.rerender();
                  }),
              );
            },
          },
          {
            name: "Write aliases back to notes",
            desc: "When a note is linked via a masterlist alias, add that alias to the target note's alias property if missing.",
            visible: () => s.masterlistEnabled,
            render: (setting) => {
              setting.addToggle((t) =>
                t.setValue(s.writeBackAliases).onChange(async (v) => {
                  s.writeBackAliases = v;
                  await this.plugin.saveSettings();
                }),
              );
            },
          },
          {
            name: "Masterlist issues",
            searchable: false,
            visible: () => {
              if (!s.masterlistEnabled || s.masterlistPath.trim() === "")
                return false;
              return this.plugin.getMasterlistProblems().length > 0;
            },
            render: (setting) => {
              this.renderMasterlistProblems(setting);
            },
          },
        ],
      },
    ];
  }

  /**
   * Imperative fallback for Obsidian < 1.13.0, which never invokes
   * getSettingDefinitions(). Walks the same definitions so there is a single
   * source of truth. On 1.13.0+ the base class renders from the definitions and
   * does not call this (display() is not invoked when getSettingDefinitions
   * returns a non-empty array).
   */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    for (const def of this.getSettingDefinitions()) {
      this.renderDefinition(containerEl, def);
    }
  }

  /**
   * Re-render the tab after state that `visible` predicates depend on changes.
   * Uses update() on 1.13.0+ (cheap, in-place); falls back to display() on
   * older versions where update() does not exist.
   */
  private rerender(): void {
    const maybeUpdate = (this as { update?: () => void }).update;
    if (typeof maybeUpdate === "function") {
      maybeUpdate.call(this);
    } else {
      this.display();
    }
  }

  /** Render one definition item (group or leaf) imperatively. */
  private renderDefinition(
    containerEl: HTMLElement,
    def: SettingDefinitionItem | SettingGroupItem,
  ): void {
    if (!isVisible(def)) return;

    // Groups: render the heading row, then their items.
    if ("type" in def && (def.type === "group" || def.type === "list")) {
      if (def.heading) {
        new Setting(containerEl).setName(def.heading).setHeading();
      }
      for (const item of def.items ?? []) {
        this.renderDefinition(containerEl, item);
      }
      return;
    }

    // Leaf items: only the `render`-based controls are used in this tab.
    if ("render" in def && typeof def.render === "function") {
      const setting = new Setting(containerEl);
      if ("name" in def && def.name) setting.setName(def.name);
      if ("desc" in def && def.desc) setting.setDesc(def.desc);
      def.render(setting, undefined as never);
    }
  }

  /** Render the masterlist validity indicator into the given setting's row. */
  private renderMasterlistStatus(setting: Setting): void {
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
    setting.setName(message);
  }

  /** Render the list of masterlist problems into the given setting's row. */
  private renderMasterlistProblems(setting: Setting): void {
    const problems = this.plugin.getMasterlistProblems();
    if (problems.length === 0) return;

    const box = setting.settingEl.createDiv({ cls: "setting-item-description" });
    box.createEl("p", { text: `Masterlist issues (${problems.length}):` });
    const ul = box.createEl("ul");
    for (const p of problems) ul.createEl("li", { text: p });
  }

  private skipDefinition(
    name: string,
    key: keyof typeof this.plugin.settings.skip,
  ): SettingGroupItem {
    return {
      name,
      render: (setting) => {
        setting.addToggle((t) =>
          t.setValue(this.plugin.settings.skip[key]).onChange(async (v) => {
            this.plugin.settings.skip[key] = v;
            await this.plugin.saveSettings();
          }),
        );
      },
    };
  }
}

/** Evaluate a definition's `visible` predicate (boolean or thunk; default true). */
function isVisible(def: { visible?: boolean | (() => boolean) }): boolean {
  const v = def.visible;
  if (v === undefined) return true;
  return typeof v === "function" ? v() : v;
}

/** Split a textarea value into trimmed, non-empty lines. */
function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}
