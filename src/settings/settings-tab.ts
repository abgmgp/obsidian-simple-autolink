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
                  this.update(); // show/hide the dependent controls
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
                    this.update();
                  });
                new MarkdownFileSuggest(this.app, search.inputEl, (path) => {
                  s.masterlistPath = path;
                  void this.plugin.saveSettings().then(() => this.update());
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
                    if (created) this.update();
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

/** Split a textarea value into trimmed, non-empty lines. */
function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}
