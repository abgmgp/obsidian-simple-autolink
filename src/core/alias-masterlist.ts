/**
 * Format: one mapping per line,
 *   canonical-note-name: alias1, alias2, alias3
 *
 * - The canonical name is everything before the first colon.
 * - Aliases are comma-separated and trimmed; blanks are dropped.
 * - Blank lines are ignored.
 * - A line with no colon, or no aliases, is reported as a problem and skipped.
 *
 * The parser does not resolve canonical names to files; that mapping happens at
 * index-build time so a masterlist entry for a non-existent note is simply
 * inert (and surfaced as a warning by the caller).
 */

export interface AliasEntry {
  canonical: string;
  aliases: string[];
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

    const colon = line.indexOf(":");
    if (colon === -1) {
      problems.push(`Line ${lineNo}: missing ':' — expected "canonical: alias1, alias2"`);
      return;
    }

    const canonical = line.slice(0, colon).trim();
    if (canonical === "") {
      problems.push(`Line ${lineNo}: empty canonical name before ':'`);
      return;
    }

    const aliases = line
      .slice(colon + 1)
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a !== "");

    if (aliases.length === 0) {
      problems.push(`Line ${lineNo}: no aliases listed for "${canonical}"`);
      return;
    }

    entries.push({ canonical, aliases });
  });

  return { entries, problems };
}

/**
 * Collapse parsed entries by canonical name (later lines extend earlier ones)
 * and de-duplicate aliases case-sensitively in first-seen order.
 */
export function mergeAliasEntries(entries: AliasEntry[]): AliasEntry[] {
  const byCanonical = new Map<string, string[]>();
  for (const e of entries) {
    const existing = byCanonical.get(e.canonical) ?? [];
    for (const a of e.aliases) {
      if (!existing.includes(a)) existing.push(a);
    }
    byCanonical.set(e.canonical, existing);
  }
  return [...byCanonical.entries()].map(([canonical, aliases]) => ({ canonical, aliases }));
}
