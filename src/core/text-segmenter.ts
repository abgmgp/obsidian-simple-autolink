/**
 * Given raw markdown, produce the set of character ranges that must NOT be
 * touched by the linker (code, existing links, frontmatter, etc.). The matcher
 * only proposes replacements that fall entirely inside linkable text.
 *
 * We work on character offsets into the original string so the matcher can map
 * replacements straight back onto the source. The strategy is a single linear
 * scan that recognizes block constructs (frontmatter, fenced code) by line and
 * inline constructs (inline code, links, math) by character.
 *
 * This is a heuristic markdown scanner, not a full CommonMark parser. It is
 * deliberately conservative: when unsure, it prefers to mark a region as a skip
 * (no link) rather than risk linking inside code or a URL.
 */

export interface SkipOptions {
  frontmatter: boolean;
  fencedCode: boolean;
  inlineCode: boolean;
  existingLinks: boolean; // [[wikilinks]] and [md](links)
  headings: boolean;
  math: boolean; // $inline$ and $$block$$
  tables: boolean; // GFM pipe tables
  tags: boolean; // Obsidian #tags
}

export const DEFAULT_SKIP_OPTIONS: SkipOptions = {
  frontmatter: true,
  fencedCode: true,
  inlineCode: true,
  existingLinks: true,
  headings: false,
  math: true,
  tables: true,
  tags: true,
};

/** A half-open character range [start, end) to skip. */
export interface SkipRange {
  start: number;
  end: number;
}

/** Merge overlapping/adjacent ranges and sort by start. */
export function mergeRanges(ranges: SkipRange[]): SkipRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: SkipRange[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** True if [start, end) overlaps any skip range. Ranges must be sorted+merged. */
export function rangeOverlaps(ranges: SkipRange[], start: number, end: number): boolean {
  // linear scan is fine for typical note sizes; ranges are sorted by start
  for (const r of ranges) {
    if (r.start >= end) break; // ranges past us; no overlap possible
    if (r.end > start) return true; // r ends after we start and starts before we end
  }
  return false;
}

const FRONTMATTER_FENCE = /^---\s*$/;

/**
 * Compute skip ranges for the given markdown and options.
 */
export function computeSkipRanges(text: string, opts: SkipOptions): SkipRange[] {
  const ranges: SkipRange[] = [];
  const lines = lineOffsets(text);

  // --- Frontmatter: only if the very first line is a `---` fence. ---
  let bodyStartLine = 0;
  if (lines.length > 0 && FRONTMATTER_FENCE.test(lines[0].text)) {
    for (let i = 1; i < lines.length; i++) {
      if (FRONTMATTER_FENCE.test(lines[i].text)) {
        if (opts.frontmatter) {
          ranges.push({ start: 0, end: lines[i].end });
        }
        bodyStartLine = i + 1;
        break;
      }
    }
  }

  // --- Fenced code blocks (``` or ~~~), headings, and GFM tables, by line. ---
  let fenceChar: string | null = null;
  let fenceStart = -1;
  for (let i = bodyStartLine; i < lines.length; i++) {
    const ln = lines[i];
    const fence = fenceMatch(ln.text);
    if (fenceChar === null) {
      if (fence) {
        fenceChar = fence;
        fenceStart = ln.start;
      } else if (opts.tables && isTableStart(lines, i)) {
        // A header row followed by a delimiter row: consume the whole table.
        const tableEnd = consumeTable(lines, i);
        ranges.push({ start: ln.start, end: lines[tableEnd].end });
        i = tableEnd;
      } else if (opts.headings && /^#{1,6}\s/.test(ln.text)) {
        ranges.push({ start: ln.start, end: ln.end });
      }
    } else if (fence === fenceChar) {
      if (opts.fencedCode) ranges.push({ start: fenceStart, end: ln.end });
      fenceChar = null;
      fenceStart = -1;
    }
  }
  // unterminated fence: skip to end of document
  if (fenceChar !== null && opts.fencedCode) {
    ranges.push({ start: fenceStart, end: text.length });
  }

  // --- Inline constructs: scan char-by-char outside fenced/frontmatter skips. ---
  const blockSkips = mergeRanges(ranges);
  const inline = scanInline(text, opts, (pos) => rangeOverlaps(blockSkips, pos, pos + 1));
  ranges.push(...inline);

  // --- Obsidian #tags: full-text regex pass, filtered against block skips. ---
  if (opts.tags) {
    ranges.push(...scanTags(text, (pos) => rangeOverlaps(blockSkips, pos, pos + 1)));
  }

  return mergeRanges(ranges);
}

/**
 * Find Obsidian tag spans (`#word`, `#nested/sub-tag`). A tag must be preceded
 * by start-of-string or a non-word character (so `foo#bar` and URL fragments
 * like `example.com/#section` are not tags), contains letters/digits/`_`/`-`/`/`,
 * and must include at least one letter (`#123` is not a tag in Obsidian).
 */
function scanTags(text: string, inBlock: (pos: number) => boolean): SkipRange[] {
  const ranges: SkipRange[] = [];
  // Boundary via lookbehind: start-of-string or any non-tag-body char. The
  // body requires at least one letter somewhere (enforced by the `\p{L}` in
  // the middle), so pure-digit `#123` and bare `#` won't match.
  const re = /(?<=^|[^\p{L}\p{N}_/\-])#[\p{L}\p{N}_/\-]*\p{L}[\p{L}\p{N}_/\-]*/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (inBlock(m.index)) continue;
    ranges.push({ start: m.index, end: m.index + m[0].length });
  }
  return ranges;
}

/** Match a fenced-code opening/closing line; returns the fence char or null. */
function fenceMatch(line: string): string | null {
  const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
  if (!m) return null;
  return m[1][0];
}

/** A line that participates in a pipe table contains an unescaped `|`. */
function isTableRow(line: string): boolean {
  return /(^|[^\\])\|/.test(line) && line.trim() !== "";
}

/**
 * A table delimiter row, e.g. `| --- | :--: |` or `---|---`. Every cell is
 * dashes with optional leading/trailing colons; pipes separate cells.
 */
function isTableDelimiter(line: string): boolean {
  const t = line.trim();
  if (!t.includes("-")) return false;
  const inner = t.replace(/^\|/, "").replace(/\|$/, "");
  const cells = inner.split("|");
  return cells.length > 0 && cells.every((c) => /^\s*:?-+:?\s*$/.test(c));
}

/** A table starts where line i is a header row and line i+1 is a delimiter. */
function isTableStart(lines: Line[], i: number): boolean {
  return (
    isTableRow(lines[i].text) &&
    i + 1 < lines.length &&
    isTableDelimiter(lines[i + 1].text)
  );
}

/** Return the index of the last line belonging to the table starting at i. */
function consumeTable(lines: Line[], i: number): number {
  let end = i + 1; // header + delimiter are guaranteed by isTableStart
  let j = end + 1;
  while (j < lines.length && isTableRow(lines[j].text)) {
    end = j;
    j++;
  }
  return end;
}

interface Line {
  text: string;
  start: number;
  end: number; // offset of the newline+1, i.e. start of next line (or text.length)
}

function lineOffsets(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === "\n") {
      lines.push({ text: text.slice(start, i), start, end: Math.min(i + 1, text.length) });
      start = i + 1;
    }
  }
  return lines;
}

/**
 * Scan for inline code, links, and math. `inBlock(pos)` tells us if a position
 * is already inside a block-level skip (frontmatter/fence) which we ignore.
 */
function scanInline(
  text: string,
  opts: SkipOptions,
  inBlock: (pos: number) => boolean,
): SkipRange[] {
  const ranges: SkipRange[] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    if (inBlock(i)) {
      i++;
      continue;
    }
    const ch = text[i];

    // Inline code: run of backticks ... matching run of backticks.
    if (ch === "`" && opts.inlineCode) {
      let ticks = 0;
      while (i + ticks < n && text[i + ticks] === "`") ticks++;
      const open = text.slice(i, i + ticks);
      const closeIdx = text.indexOf(open, i + ticks);
      if (closeIdx !== -1) {
        ranges.push({ start: i, end: closeIdx + ticks });
        i = closeIdx + ticks;
        continue;
      }
      i += ticks;
      continue;
    }

    // Wikilink [[...]] or markdown link [text](url).
    if (ch === "[" && opts.existingLinks) {
      if (text[i + 1] === "[") {
        const close = text.indexOf("]]", i + 2);
        if (close !== -1) {
          ranges.push({ start: i, end: close + 2 });
          i = close + 2;
          continue;
        }
      } else {
        // [text](url) — require the full shape on the same logical span.
        const closeBracket = text.indexOf("]", i + 1);
        if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
          const closeParen = text.indexOf(")", closeBracket + 2);
          if (closeParen !== -1) {
            ranges.push({ start: i, end: closeParen + 1 });
            i = closeParen + 1;
            continue;
          }
        }
      }
    }

    // Math: $$...$$ (block) or $...$ (inline).
    if (ch === "$" && opts.math) {
      if (text[i + 1] === "$") {
        const close = text.indexOf("$$", i + 2);
        if (close !== -1) {
          ranges.push({ start: i, end: close + 2 });
          i = close + 2;
          continue;
        }
      } else {
        // inline $...$: closing $ on same line, not escaped, non-empty
        const nl = text.indexOf("\n", i + 1);
        const limit = nl === -1 ? n : nl;
        let j = i + 1;
        while (j < limit && text[j] !== "$") j++;
        if (j < limit && j > i + 1) {
          ranges.push({ start: i, end: j + 1 });
          i = j + 1;
          continue;
        }
      }
    }

    i++;
  }

  return ranges;
}
