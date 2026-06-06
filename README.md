# Simple Auto-Link

Converts similar matching words into wiki links on the go. Highly customizable. Supports both desktop and mobile (iOS + Android) versions of [Obsidian](https://obsidian.md).

---

## Features

- **Automatic detection** (by default) of matching search results when you modify a file by using smart matching to filter the closest possible link. See the match case behavior below for the specifics.
- Code blocks, inline code, existing links,
  YAML properties, and math are always skipped. Headings and tables can be skipped with their respective settings option.
- Include/exclude folders for manual vault linking. Excluded notes are neither scanned nor used as link targets.
- **Alias masterlist:** allows a single note file to map to multiple aliases, with automatic backfill into each note's YAML alias field.
- **Highly configurable**: Toggle features on or off in the plugin's settings page.
- **Mobile-friendly:** lightweight, cross-platform, and optimized to support larger vaults.

## How the matching works (and what it won't do)

- Longer match cases are preferred than shorter ones. Matching is case-insensitive by default, can be toggled in the settings. A note is **never** linked to itself.
- Word-boundary aware, the plugin will never links inside another word (For example, `concatenate` won't match `cat`). 
- Optional **base word** matching so that plural words (`cats`) links to a note titled `cat`.
- Optional **one link per file** so a note isn't linked over and 
  over.
- When the matched text differs from the note title (case difference or an alias), Auto-link writes a display link: `[[Canonical|what you typed]]`.
- Titles that are common English words (`the`, `note`) will match aggressively. If you want to restrict these words, either scope them out with the folder exclude list or keep base-form matching off.
- Title detection conflicts across notes resolve last-write-wins; the masterlist takes precedence over vault titles.

## Warning
### Make sure to create a backup your vault before you try the vault-wide manual link feature. Your way of writing in your vault might not automatically translate on how the matching functionality of this plugin works.

## Usage

### Run on the whole vault

Click the **link** ribbon icon, or open the command palette and run
**"Auto-link: Scan whole vault"** to toggle manual linking. You can also bind a hotkey to that command in
**Settings → Hotkeys**.

A summary of how many links were added across how many notes are edited within a single run session will be shown once the process is completed.

### Run on save

Turn on **Settings → Auto-link → Link on save**. Editing and saving a note triggers the linking process it automatically.

## Configuration

You can configure the following options in the settings page to turn features on or off to your liking:

| Setting | What it does |
| --- | --- |
| **Case sensitivity** | Turns case sensitivty on or off (default). |
| **Match base form** | Links simple plurals to their singular note. Turned off by default to avoid over-linking. |
| **One link per file** | Links each target note only once per file, with first occurrence basis. On by default. |
| **Skip → Headings** | Don't link inside headings. Turned off by default. |
| **Skip → Tables** | Don't link inside tables. Turned off by default.|
| **Link on save** | Auto-link notes when the current note is modified. |
| **Include folders** | Include folders based on path. One folder path per line. Empty defaults to whole vault. |
| **Exclude folders** | Exclude folders based on path. Excluded notes are skipped and never used as targets. |
| **Alias masterlist** | Toggle the feature on or off, set the file path, and optionally write matched aliases back to the main note's YAML property (see below). |

### Folder matching

Patterns are matched against vault-relative paths:

- `*` matches within a path segment, `**` spans folders, `?` matches one char.
- A bare folder name (e.g. `Archive`) is shorthand for `Archive/**`.

Examples:

```
Concepts
Projects/**
Daily/2024-*.md
```
### Dynamic Alias Masterlist

The alias masterlist allows for the addition of extra search terms that point at a different note that may or may not be beyond the target note's title and its own frontmatter aliases.

To toggle the alias masterlist feature on, do the following:

1. Go to Obsidian -> **Settings → Simple Auto-Link →** turn on **Use alias masterlist**.
2. Set the **Masterlist file path** (any `.md` file in your vault). Either pick an existing file, or enter a new path and click **Create template**.
3. Edit the file. The plugin watches and reloads on save.

### Format

The masterlist allows one mapping of search term per line, like this:

```
Note name: alias1, alias2, alias3
```

- The name must match an existing note's title.
- Aliases are comma-separated; each becomes a match term for that note.
- The masterlist supports adding comments with `#`. Blank lines are also ignored.

Example:

```
Timetable: time table, tt
API: application programming interface, api
```

### YAML Property Auto-Add

When **"Write aliases back to notes"** is on (default), the first time a note is linked via a masterlist alias, that alias is added to the note's YAML `aliases` property. No existing aliases are removed or reordered. This makes the alias work everywhere Obsidian resolves links, not just inside the plugin.

## Roadmap
- Improve alias masterlist to allow blacklisting of certain keywords
- Choice for certain keywords to auto-link up to the base folder only, specific folders, or to exclude specific folders
- **You tell me**!

## Privacy & Safety

- All file reads and writes go through Obsidian's Vault / FileManager APIs.
- No network access, no telemetry, no Node/filesystem access.
- Properties are only edited through Obsidian's own `processFrontMatter` method.

## Installation
- **Using the Community Manager:** Go to **Obsidian -> Settings -> Community Plugins -> Browse**, search for **Simple Auto-Link**, then click install. Make sure Community Plugins are turned on before doing the following steps.
- **Using BRAT:** Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat)
  plugin, then "Add beta plugin" with this repository URL.
- **Manual installation:** Download `main.js` and `manifest.json` from a release and copy
  them into `<your-vault>/.obsidian/plugins/obsidian-simple-autolink/`, then enable the
  plugin in Settings.

## Development and Contribution

In order to setup the source files, clone the repository, open your editor/tool of choice then run the following:

```sh
npm install
npm run dev     # esbuild watch -> main.js
npm run build   # type-check (strict) + production bundle
npm test        # Vitest unit + perf tests
```

## Disclaimer

This plugin was created with assistance from Artificial Intelligence tools. Human intervention was done during the drafting, feature development, and validation (source code and functionality) of the project. If that does not sit well with you, please consider using other alternatives.

## License

This project is licensed under the [MIT License](LICENSE), allowing free use, modification, and distribution.
