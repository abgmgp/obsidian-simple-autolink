import { describe, it, expect } from "vitest";
import {
  buildMatchIndex,
  findReplacements,
  applyReplacements,
  scopeAllows,
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

describe("scopeAllows", () => {
  const target = (path: string, scope?: "vault" | "block" | "folder" | "root") => ({
    canonical: "X",
    path,
    scope,
  });

  it("allows vault-wide (undefined and 'vault')", () => {
    expect(scopeAllows(target("a/b/c.md"), "x/y.md")).toBe(true);
    expect(scopeAllows(target("a/b/c.md", "vault"), "x/y.md")).toBe(true);
  });

  it("blocks 'block' scope unconditionally", () => {
    expect(scopeAllows(target("a/b/c.md", "block"), "a/b/d.md")).toBe(false);
  });

  it("folder scope requires same parent directory", () => {
    expect(scopeAllows(target("a/b/c.md", "folder"), "a/b/d.md")).toBe(true);
    expect(scopeAllows(target("a/b/c.md", "folder"), "a/x/d.md")).toBe(false);
    expect(scopeAllows(target("top.md", "folder"), "other.md")).toBe(true);
    expect(scopeAllows(target("top.md", "folder"), "sub/other.md")).toBe(false);
  });

  it("root scope requires same top-level segment", () => {
    expect(
      scopeAllows(target("Programming/Ideas/View.md", "root"), "Programming/Other.md"),
    ).toBe(true);
    expect(
      scopeAllows(target("Programming/Ideas/View.md", "root"), "Programming/Views/x.md"),
    ).toBe(true);
    expect(
      scopeAllows(target("Programming/Ideas/View.md", "root"), "Journal/2026.md"),
    ).toBe(false);
  });
});

describe("findReplacements - scope guard", () => {
  function withScope(
    sourcePath: string,
    target: { canonical: string; path: string; scope?: "vault" | "block" | "folder" | "root" },
    surface: string,
  ) {
    const entries: IndexEntry[] = [
      {
        key: normalize(surface, NORM),
        term: surface,
        target: { ...target, alias: surface },
      },
    ];
    const index = buildMatchIndex(entries);
    const text = `before ${surface} after`;
    const skips = computeSkipRanges(text, DEFAULT_SKIP_OPTIONS);
    return findReplacements(text, index, skips, {
      normalize: NORM,
      oneLinkPerFile: false,
      sourcePath,
    });
  }

  it("folder-scoped target links only when source shares the parent folder", () => {
    expect(
      withScope("Personal/today.md", { canonical: "Notes", path: "Personal/Notes.md", scope: "folder" }, "nts"),
    ).toHaveLength(1);
    expect(
      withScope("Work/today.md", { canonical: "Notes", path: "Personal/Notes.md", scope: "folder" }, "nts"),
    ).toHaveLength(0);
  });

  it("root-scoped target links only when source shares the top-level segment", () => {
    expect(
      withScope(
        "Programming/Other/x.md",
        { canonical: "View", path: "Programming/Ideas/View.md", scope: "root" },
        "views",
      ),
    ).toHaveLength(1);
    expect(
      withScope(
        "Journal/2026.md",
        { canonical: "View", path: "Programming/Ideas/View.md", scope: "root" },
        "views",
      ),
    ).toHaveLength(0);
  });

  it("block-scoped target never matches", () => {
    expect(
      withScope("anywhere.md", { canonical: "View", path: "View.md", scope: "block" }, "View"),
    ).toHaveLength(0);
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
