import { describe, it, expect } from "vitest";
import {
  buildMatchIndex,
  findReplacements,
  applyReplacements,
  IndexEntry,
} from "../src/core/matcher";
import { normalize, NormalizeOptions } from "../src/core/normalizer";
import {
  computeSkipRanges,
  DEFAULT_SKIP_OPTIONS,
  SkipOptions,
} from "../src/core/text-segmenter";

const NORM: NormalizeOptions = { caseInsensitive: true, matchBaseForm: false };

function idx(terms: Array<[string, string, string]>) {
  const entries: IndexEntry[] = terms.map(([term, canonical, path]) => ({
    key: normalize(term, NORM),
    term,
    target: { canonical, path, alias: term === canonical ? undefined : term },
  }));
  return buildMatchIndex(entries);
}

function link(
  text: string,
  terms: Array<[string, string, string]>,
  skipOverrides: Partial<SkipOptions> = {},
) {
  const index = idx(terms);
  const skipOpts = { ...DEFAULT_SKIP_OPTIONS, ...skipOverrides };
  const skips = computeSkipRanges(text, skipOpts);
  const replacements = findReplacements(text, index, skips, {
    normalize: NORM,
    oneLinkPerFile: false,
    sourcePath: "note.md",
  });
  return { replacements, out: applyReplacements(text, replacements) };
}

describe("findReplacements - phrase boundary guard", () => {
  it("still links a multi-word alias as a contiguous phrase in prose", () => {
    const { out } = link("a time table here", [
      ["time table", "Timetable", "Timetable.md"],
    ]);
    expect(out).toBe("a [[Timetable|time table]] here");
  });

  it("rejects a multi-word match split across a newline (soft wrap)", () => {
    const { replacements } = link("time\ntable", [
      ["time table", "Timetable", "Timetable.md"],
    ]);
    expect(replacements).toEqual([]);
  });

  it("rejects a multi-word match split across an unescaped pipe in prose", () => {
    // even outside a real GFM table, a stray `|` between tokens must not be
    // bridged — it could still produce a wikilink whose alias `|` confuses
    // downstream tooling.
    const { replacements } = link("time | table", [
      ["time table", "Timetable", "Timetable.md"],
    ]);
    expect(replacements).toEqual([]);
  });
});

describe("tables are always skipped", () => {
  it("does not link inside a table cell under default settings", () => {
    expect(DEFAULT_SKIP_OPTIONS.tables).toBe(true);
    const text = "| Foo | bar |\n| --- | --- |\n";
    const { replacements } = link(text, [["Foo", "Foo", "Foo.md"]]);
    expect(replacements).toEqual([]);
  });

  it("does not link inside a table cell even for alias-form base-form matches", () => {
    // surface "lists" maps to canonical "Lists" via base-form. Inside a cell
    // this would render as `[[Lists|lists]]`, whose `|` splits the cell.
    // tables-always-skipped makes this impossible.
    const text = "| lists | other |\n| ----- | ----- |\n";
    const entries: IndexEntry[] = [
      {
        key: normalize("Lists", { caseInsensitive: true, matchBaseForm: true }),
        term: "Lists",
        target: { canonical: "Lists", path: "Lists.md" },
      },
    ];
    const index = buildMatchIndex(entries);
    const skips = computeSkipRanges(text, DEFAULT_SKIP_OPTIONS);
    const replacements = findReplacements(text, index, skips, {
      normalize: { caseInsensitive: true, matchBaseForm: true },
      oneLinkPerFile: false,
      sourcePath: "note.md",
    });
    expect(replacements).toEqual([]);
  });
});

describe("headings are user-configurable", () => {
  it("links inside headings by default", () => {
    expect(DEFAULT_SKIP_OPTIONS.headings).toBe(false);
    const text = "# Foo bar\n";
    const { out } = link(text, [["Foo", "Foo", "Foo.md"]]);
    expect(out).toBe("# [[Foo]] bar\n");
  });

  it("respects the headings skip toggle when enabled", () => {
    const text = "# Foo bar\n";
    const { replacements } = link(
      text,
      [["Foo", "Foo", "Foo.md"]],
      { headings: true },
    );
    expect(replacements).toEqual([]);
  });
});
