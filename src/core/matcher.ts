/**
 * Input: source markdown, a TargetIndex (term -> target), and options.
 * Output: an ordered list of replacements (non-overlapping, left-to-right) plus
 * a convenience `apply()` that produces the linked text.
 */

import { normalize, NormalizeOptions } from "./normalizer";
import { SkipRange, rangeOverlaps } from "./text-segmenter";
import type { AliasScope } from "./alias-masterlist";

/** A resolvable link target. `path` identifies the note (used for self-ref + dedupe). */
export interface LinkTarget {
  /** Canonical note name used as the wikilink destination */
  canonical: string;
  /** Vault path of the note */
  path: string;
  /**
   * If this target was reached via an alias rather than the title, the original
   * alias text. Used by the alias-writer to backfill frontmatter. Undefined for
   * title matches.
   */
  alias?: string;
  /**
   * Optional scope restriction inherited from a masterlist entry. When set, the
   * matcher only emits a replacement if the source file passes the scope check.
   * Undefined or "vault" means vault-wide (default).
   */
  scope?: AliasScope;
}

/** Parent directory of a vault path (substring before the last '/'). */
function parentDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Top-level folder segment of a vault path (substring before the first '/'). */
function rootSegment(path: string): string {
  const i = path.indexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/**
 * Decide whether a target's scope allows linking it from `sourcePath`.
 * Pure — exported for testing.
 */
export function scopeAllows(target: LinkTarget, sourcePath: string): boolean {
  switch (target.scope) {
    case undefined:
    case "vault":
      return true;
    case "block":
      return false;
    case "folder":
      return parentDir(target.path) === parentDir(sourcePath);
    case "root":
      return rootSegment(target.path) === rootSegment(sourcePath);
  }
}

/**
 * An index entry: a normalized search key mapped to a target, plus the raw
 * surface length (in original, un-normalized characters of the source term)
 * is NOT stored here — we re-derive match length from the source at match time
 * via the key's word count. We keep the original term for that.
 */
export interface IndexEntry {
  /** Normalized key used for lookup (already case/base-form folded). */
  key: string;
  /** The original (display) term this key came from */
  term: string;
  target: LinkTarget;
}

/**
 * The matcher index: a flat list of entries plus a max word-count to bound the
 * sliding window. Build this from a TargetIndex with `buildMatchIndex`.
 */
export interface MatchIndex {
  /** Normalized key -> entry. Last write wins on collision (caller warns). */
  byKey: Map<string, IndexEntry>;
  /** Largest number of words in any key, to bound the matching window. */
  maxWords: number;
}

export interface MatchOptions {
  normalize: NormalizeOptions;
  /** Link each unique target at most once per file (first occurrence wins). */
  oneLinkPerFile: boolean;
  /** Path of the file being processed, for the self-reference guard. */
  sourcePath: string;
}

export interface Replacement {
  start: number; // char offset in source
  end: number; // char offset in source (half-open)
  /** The exact source text being replaced (the matched surface form). */
  matched: string;
  target: LinkTarget;
  /** The wikilink to insert, including display alias when surface != canonical. */
  link: string;
}

/** Build a fast match index from a list of entries. */
export function buildMatchIndex(entries: IndexEntry[]): MatchIndex {
  const byKey = new Map<string, IndexEntry>();
  let maxWords = 1;
  for (const e of entries) {
    byKey.set(e.key, e);
    const words = countWords(e.key);
    if (words > maxWords) maxWords = words;
  }
  return { byKey, maxWords };
}

function countWords(s: string): number {
  const t = s.trim();
  if (t === "") return 0;
  return t.split(/\s+/).length;
}

/** A token (word) with its source offsets. */
interface Token {
  text: string;
  start: number;
  end: number;
}

/**
 * Tokenize into runs of "word" characters. Word = letters, digits, underscore,
 * and internal apostrophes/hyphens are treated as separators here (so the
 * matcher's window aligns with normalize()'s whitespace splitting). We match
 * whole-token spans only, which gives word-boundary behavior for free.
 */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /[\p{L}\p{N}]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/**
 * Compute replacements for `text`. Returns non-overlapping replacements ordered
 * by position.
 *
 * Smart-matching filter hierarchy (highest precedence first). Folder
 * include/exclude (batch-level) is applied by the caller before we ever see the
 * file; the remaining steps run here, per candidate span:
 *
 *   1. folder includes/excludes  — caller (out of scope here)
 *   2. skips                     — never link inside a skip range
 *   3. alias / self-reference    — resolve the term, drop self-links
 *   4. case sensitivity          — folded into the normalized key lookup
 *   5. one-link-per-file         — if on, link each target at most once,
 *                                  counting wikilinks ALREADY in the file so a
 *                                  pre-existing link wins and re-runs are no-ops
 *   6. plural matching           — folded into the normalized key (base form)
 *
 * Steps 4 and 6 are not separate branches: case folding and base-form
 * stripping are baked into `normalize()`, so the index key already encodes
 * them. The explicit branches below implement 2, 3, and 5 in that order, and
 * one-link-per-file is seeded from existing links so it actually takes effect.
 */
export function findReplacements(
  text: string,
  index: MatchIndex,
  skips: SkipRange[],
  opts: MatchOptions,
): Replacement[] {
  const tokens = tokenize(text);
  const replacements: Replacement[] = [];

  // (5) One-link-per-file: seed the dedupe set with targets that are ALREADY
  // linked in this file. A pre-existing [[wikilink]] counts as the one allowed
  // link, so later plain-text occurrences are skipped and re-runs are no-ops.
  const linkedTargets = opts.oneLinkPerFile
    ? collectExistingTargets(text, index, opts.normalize)
    : new Set<string>();

  let ti = 0;
  while (ti < tokens.length) {
    let matched: { entry: IndexEntry; start: number; end: number; surface: string } | null = null;

    // Longest match first: try the widest window down to a single token.
    const maxSpan = Math.min(index.maxWords, tokens.length - ti);
    for (let span = maxSpan; span >= 1; span--) {
      const first = tokens[ti];
      const last = tokens[ti + span - 1];

      // A multi-word match must be a single contiguous phrase. Reject windows
      // whose inter-token gap contains a newline or an unescaped `|` — those
      // are structural boundaries (lines, table cells, wikilink alias
      // separator) and a real phrase never crosses them. Without this guard
      // the matcher can produce links like `[[Timetable|time | table]]` that
      // span table cells and break Obsidian's link parser.
      if (span > 1 && spansPhraseBoundary(text, tokens, ti, span)) continue;

      const surface = text.slice(first.start, last.end);

      // (2) Skips: don't link inside a skip range (existing links, code, …).
      if (rangeOverlaps(skips, first.start, last.end)) continue;

      // (4)+(6) Case + plural: resolve via the normalized key, which already
      // encodes case folding and base-form (plural) stripping.
      const key = normalize(surface, opts.normalize);
      const entry = index.byKey.get(key);
      // (3) Alias/title hit? No entry => not a match.
      if (!entry) continue;
      // (3) Self-reference guard: never link a note to itself.
      if (entry.target.path === opts.sourcePath) continue;
      // (3b) Scope guard: masterlist-scoped targets only link within scope.
      if (!scopeAllows(entry.target, opts.sourcePath)) continue;
      // (5) One-link-per-file dedupe (counts existing links via the seed above).
      if (opts.oneLinkPerFile && linkedTargets.has(entry.target.path)) continue;

      matched = { entry, start: first.start, end: last.end, surface };
      break;
    }

    if (matched) {
      replacements.push({
        start: matched.start,
        end: matched.end,
        matched: matched.surface,
        target: matched.entry.target,
        link: renderLink(matched.surface, matched.entry.target),
      });
      linkedTargets.add(matched.entry.target.path);
      // Advance past the consumed tokens.
      const consumed = countWords(matched.entry.key);
      ti += consumed;
    } else {
      ti += 1;
    }
  }

  return replacements;
}

/**
 * True if any gap between consecutive tokens in the window [ti, ti+span)
 * contains a newline or an unescaped `|`. Caller guarantees span > 1.
 */
function spansPhraseBoundary(
  text: string,
  tokens: Token[],
  ti: number,
  span: number,
): boolean {
  for (let k = 0; k < span - 1; k++) {
    const gap = text.slice(tokens[ti + k].end, tokens[ti + k + 1].start);
    if (gap.includes("\n")) return true;
    // unescaped pipe: a `|` not preceded by `\` (mirrors isTableRow in text-segmenter)
    if (/(^|[^\\])\|/.test(gap)) return true;
  }
  return false;
}

/**
 * Scan `text` for existing wikilinks (`[[Target]]` / `[[Target|alias]]` /
 * `[[Target#heading]]`) and return the set of target paths they resolve to via
 * the index. Used to seed one-link-per-file so a link already present in the
 * file counts as "the one link" and is never duplicated. Pure.
 */
function collectExistingTargets(
  text: string,
  index: MatchIndex,
  normalizeOpts: NormalizeOptions,
): Set<string> {
  const targets = new Set<string>();
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // The destination is the part before any "|" (display alias) or "#"
    // (heading/block ref). Trim so "[[ Foo | bar ]]" still resolves.
    const dest = m[1].split("|")[0].split("#")[0].trim();
    if (dest === "") continue;
    const entry = index.byKey.get(normalize(dest, normalizeOpts));
    if (entry) targets.add(entry.target.path);
  }
  return targets;
}

/**
 * Render the wikilink for a matched surface form. If the surface text differs
 * from the canonical note name (case difference or alias), use a display alias
 * `[[Canonical|surface]]` so the rendered text matches what the user wrote.
 */
function renderLink(surface: string, target: LinkTarget): string {
  if (surface === target.canonical) {
    return `[[${target.canonical}]]`;
  }
  return `[[${target.canonical}|${surface}]]`;
}

/** Apply replacements (assumed non-overlapping, sorted) to produce linked text. */
export function applyReplacements(text: string, replacements: Replacement[]): string {
  if (replacements.length === 0) return text;
  const sorted = [...replacements].sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const r of sorted) {
    out += text.slice(cursor, r.start);
    out += r.link;
    cursor = r.end;
  }
  out += text.slice(cursor);
  return out;
}
