/**
 * Format: one mapping per line. Two shapes are supported:
 *
 *   canonical-note-name: alias1, alias2, alias3        # default (vault-wide)
 *   <scope>: canonical-note-name: alias1, alias2       # scoped
 *   <scope>: canonical-note-name                       # scoped (no aliases - applies to title + frontmatter aliases)
 *
 * Recognized scope keywords (case-insensitive): `block`, `folder`, `root`.
 *
 * - `block`  : never auto-link this canonical (or its listed aliases).
 * - `folder` : only auto-link when the source note shares the target's parent folder.
 * - `root`   : only auto-link when the source note shares the target's top-level folder.
 *
 * A `folder`/`root` entry re-scopes the target note's title and frontmatter
 * aliases to the named scope. Any aliases listed on the entry are added as
 * additional surface forms at the same scope. So `folder: Note` and
 * `folder: Note: extra` both scope the canonical title; the second form just
 * adds "extra" as another folder-scoped match term.
 *
 * Parser rules:
 * - The canonical name is everything before the next colon.
 * - Aliases are comma-separated and trimmed; blanks are dropped.
 * - Blank lines and `#` comment lines are ignored.
 * - A line with no colon, or no aliases (when the scope requires them), is
 *   reported as a problem and skipped.
 *
 * The parser does not resolve canonical names to files; that mapping happens at
 * index-build time so a masterlist entry for a non-existent note is simply
 * inert (and surfaced as a warning by the caller).
 */

export type AliasScope = "vault" | "block" | "folder" | "root";

const SCOPE_KEYWORDS: Record<string, AliasScope> = {
  block: "block",
  folder: "folder",
  root: "root",
};

export interface AliasEntry {
  canonical: string;
  aliases: string[];
  /** Scope inherited from the entry's prefix. Omitted = vault-wide. */
  scope?: AliasScope;
}

/** Example content for a new masterlist file. */
export const MASTERLIST_TEMPLATE = `Timetable: time table, tt`;

export interface ParsedMasterlist {
  entries: AliasEntry[];
  /** Human-readable problems (1-based line numbers) for surfacing in settings. */
  problems: string[];
}

export function parseMasterlist(text: string): ParsedMasterlist {
  const entries: AliasEntry[] = [];
  const problems: string[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) return;

    const firstColon = line.indexOf(":");
    if (firstColon === -1) {
      problems.push(`Line ${lineNo}: missing ':' - expected "canonical: alias1, alias2"`);
      return;
    }

    const head = line.slice(0, firstColon).trim().toLowerCase();
    const maybeScope = SCOPE_KEYWORDS[head];
    const scope: AliasScope = maybeScope ?? "vault";
    const body = maybeScope ? line.slice(firstColon + 1).trim() : line;

    const bodyColon = body.indexOf(":");
    let canonical: string;
    let aliases: string[];
    if (bodyColon === -1) {
      canonical = body.trim();
      aliases = [];
      if (canonical === "") {
        problems.push(`Line ${lineNo}: empty canonical name`);
        return;
      }
      if (scope === "vault") {
        problems.push(`Line ${lineNo}: no aliases listed for "${canonical}"`);
        return;
      }
    } else {
      canonical = body.slice(0, bodyColon).trim();
      if (canonical === "") {
        problems.push(`Line ${lineNo}: empty canonical name before ':'`);
        return;
      }
      aliases = body
        .slice(bodyColon + 1)
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a !== "");
      if (aliases.length === 0 && scope === "vault") {
        problems.push(`Line ${lineNo}: no aliases listed for "${canonical}"`);
        return;
      }
    }

    entries.push({ canonical, aliases, scope });
  });

  return { entries, problems };
}

/**
 * Collapse parsed entries by (canonical, scope) - later lines extend earlier
 * ones - and de-duplicate aliases case-sensitively in first-seen order.
 * Different scopes for the same canonical are kept separate so a `block:`
 * rule can co-exist with (and override) a vault-wide entry at match time.
 */
export function mergeAliasEntries(entries: AliasEntry[]): AliasEntry[] {
  const byKey = new Map<string, { canonical: string; scope: AliasScope; aliases: string[] }>();
  for (const e of entries) {
    const scope: AliasScope = e.scope ?? "vault";
    const key = `${scope} ${e.canonical}`;
    const existing = byKey.get(key);
    if (existing) {
      for (const a of e.aliases) {
        if (!existing.aliases.includes(a)) existing.aliases.push(a);
      }
    } else {
      byKey.set(key, { canonical: e.canonical, scope, aliases: [...e.aliases] });
    }
  }
  return [...byKey.values()].map(({ canonical, scope, aliases }) => ({ canonical, scope, aliases }));
}
