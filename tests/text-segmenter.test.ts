import { describe, it, expect } from "vitest";
import {
  computeSkipRanges,
  mergeRanges,
  rangeOverlaps,
  DEFAULT_SKIP_OPTIONS,
  SkipOptions,
} from "../src/core/text-segmenter";

const ALL: SkipOptions = { ...DEFAULT_SKIP_OPTIONS, headings: true, tables: true };

/** Helper: return the substrings the skip ranges cover, for readable asserts. */
function skipped(text: string, opts: SkipOptions = ALL): string[] {
  return computeSkipRanges(text, opts).map((r) => text.slice(r.start, r.end));
}

describe("mergeRanges", () => {
  it("merges overlapping and adjacent ranges", () => {
    expect(mergeRanges([{ start: 0, end: 5 }, { start: 5, end: 9 }, { start: 3, end: 4 }])).toEqual([
      { start: 0, end: 9 },
    ]);
  });
  it("keeps disjoint ranges", () => {
    expect(mergeRanges([{ start: 10, end: 12 }, { start: 0, end: 2 }])).toEqual([
      { start: 0, end: 2 },
      { start: 10, end: 12 },
    ]);
  });
});

describe("rangeOverlaps", () => {
  const ranges = mergeRanges([{ start: 5, end: 10 }]);
  it("detects overlap", () => {
    expect(rangeOverlaps(ranges, 4, 6)).toBe(true);
    expect(rangeOverlaps(ranges, 9, 11)).toBe(true);
  });
  it("detects non-overlap", () => {
    expect(rangeOverlaps(ranges, 0, 5)).toBe(false); // half-open: touches at 5
    expect(rangeOverlaps(ranges, 10, 12)).toBe(false);
  });
});

describe("computeSkipRanges", () => {
  it("skips frontmatter", () => {
    const text = "---\ntitle: Foo\n---\nbody microservice here";
    const ranges = computeSkipRanges(text, ALL);
    expect(text.slice(ranges[0].start, ranges[0].end)).toContain("title: Foo");
    expect(ranges[0].start).toBe(0);
  });

  it("does not treat a mid-document --- as frontmatter", () => {
    const text = "intro\n---\nnot frontmatter\n";
    expect(skipped(text)).toEqual([]);
  });

  it("skips fenced code blocks", () => {
    const text = "before\n```\nAPI Gateway inside\n```\nafter";
    const s = skipped(text);
    expect(s.some((x) => x.includes("API Gateway inside"))).toBe(true);
    expect(s.join("")).not.toContain("before");
  });

  it("skips unterminated fenced code to end", () => {
    const text = "x\n```\nstuff to the end";
    const ranges = computeSkipRanges(text, ALL);
    expect(ranges[ranges.length - 1].end).toBe(text.length);
  });

  it("skips inline code", () => {
    expect(skipped("use `npm run build` now")).toEqual(["`npm run build`"]);
  });

  it("skips wikilinks and markdown links", () => {
    expect(skipped("see [[Foo Bar]] and [text](http://x)")).toEqual([
      "[[Foo Bar]]",
      "[text](http://x)",
    ]);
  });

  it("skips inline and block math", () => {
    expect(skipped("a $x + y$ b $$E=mc^2$$ c")).toEqual(["$x + y$", "$$E=mc^2$$"]);
  });

  it("skips headings only when enabled", () => {
    expect(skipped("# Heading One\nbody", ALL)).toEqual(["# Heading One\n"]);
    expect(skipped("# Heading One\nbody", DEFAULT_SKIP_OPTIONS)).toEqual([]);
  });

  it("skips GFM tables only when enabled", () => {
    const text = "intro Foo\n\n| Name | Note |\n| --- | --- |\n| Foo | Bar |\n\nafter Foo";
    const on = skipped(text, ALL);
    expect(on).toHaveLength(1);
    expect(on[0]).toContain("| Name | Note |");
    expect(on[0]).toContain("| Foo | Bar |");
    expect(on[0]).not.toContain("intro");
    expect(on[0]).not.toContain("after");
    // default leaves tables linkable
    expect(skipped(text, DEFAULT_SKIP_OPTIONS)).toEqual([]);
  });

  it("does not treat a lone pipe line as a table without a delimiter row", () => {
    const text = "a | b is not a table\nplain Foo line";
    expect(skipped(text, ALL)).toEqual([]);
  });

  it("handles a table with leading/trailing pipes and alignment", () => {
    const text = "| A | B |\n|:--|--:|\n| x | y |\n";
    const s = skipped(text, ALL);
    expect(s).toHaveLength(1);
    expect(s[0]).toContain("|:--|--:|");
  });

  it("does not detect tables inside fenced code", () => {
    const text = "```\n| A | B |\n| --- | --- |\n| x | y |\n```";
    const s = skipped(text, ALL);
    // exactly one range: the whole fenced block, not a separate table range
    expect(s).toHaveLength(1);
    expect(s[0].startsWith("```")).toBe(true);
  });

  it("respects per-element toggles", () => {
    const text = "`code` [[link]]";
    const onlyCode: SkipOptions = { ...ALL, existingLinks: false };
    expect(skipped(text, onlyCode)).toEqual(["`code`"]);
  });
});
