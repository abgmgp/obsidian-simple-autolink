/**
 * Input: source markdown, a TargetIndex (term -> target), and options.
 * Output: an ordered list of replacements (non-overlapping, left-to-right) plus
 * a convenience `apply()` that produces the linked text.
 */

import { normalize, NormalizeOptions } from "./normalizer";
import { SkipRange, rangeOverlaps } from "./text-segmenter";

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
 * by position. Honors skip ranges, self-reference, and one-link-per-file.
 */
export function findReplacements(
  text: string,
  index: MatchIndex,
  skips: SkipRange[],
  opts: MatchOptions,
): Replacement[] {
  const tokens = tokenize(text);
  const replacements: Replacement[] = [];
  const linkedTargets = new Set<string>(); // target.path, for oneLinkPerFile

  let ti = 0;
  while (ti < tokens.length) {
    let matched: { entry: IndexEntry; start: number; end: number; surface: string } | null = null;

    // Longest match first: try the widest window down to a single token.
    const maxSpan = Math.min(index.maxWords, tokens.length - ti);
    for (let span = maxSpan; span >= 1; span--) {
      const first = tokens[ti];
      const last = tokens[ti + span - 1];
      const surface = text.slice(first.start, last.end);
      const key = normalize(surface, opts.normalize);
      const entry = index.byKey.get(key);
      if (!entry) continue;

      // Don't link inside a skip range.
      if (rangeOverlaps(skips, first.start, last.end)) continue;
      // Self-reference guard.
      if (entry.target.path === opts.sourcePath) continue;
      // One-link-per-file dedupe.
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
