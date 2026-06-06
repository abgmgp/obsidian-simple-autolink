# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Released]

## [1.0.0] - 2026-06-06

Initial release.

### Added

- Convert plain-text mentions of note titles and aliases into `[[wiki links]]`.
- **Triggers:** manual full-vault run or an on-save trigger; both can be
  active at once.
- **Matching:** longest-match-first, word-boundary aware, case-insensitive
  (toggleable), optional base-form matching, and an optional
  one-link-per-file mode.
- **Segmentation:** always skips code blocks, inline code, existing links,
  frontmatter, and math; headings and tables are skippable via toggles.
- **Path scoping:** include/exclude folder paths; excluded notes are not scanned
  and not used as link targets.
- **Alias masterlist:** user-defined `.md` file mapping note names to
  aliases, can be toggled on or off.
- **Mobile support:** built for cross-platform support, and optimized for larger vaults.

[Released]: https://github.com/abgmgp/obsidian-simple-autolink/compare/1.0.0...HEAD
[1.0.0]: https://github.com/abgmgp/obsidian-simple-autolink/releases/tag/1.0.0

