import { describe, it, expect } from "vitest";
import { linkContent } from "../src/core/link-engine";
import { buildMatchIndex, IndexEntry } from "../src/core/matcher";
import { normalize } from "../src/core/normalizer";
import { DEFAULT_SETTINGS, AutoLinkSettings } from "../src/settings/settings";

function indexOf(terms: [string, string, string][]) {
  const entries: IndexEntry[] = terms.map(([term, canonical, path]) => ({
    key: normalize(term, DEFAULT_SETTINGS.normalize),
    term,
    target: { canonical, path },
  }));
  return buildMatchIndex(entries);
}

const settings: AutoLinkSettings = { ...DEFAULT_SETTINGS, oneLinkPerFile: false };

describe("masterlist alias linking (acceptance)", () => {
  it("links both alias phrases to the canonical note and flags backfill", () => {
    // Simulate the index that buildIndex would produce for a masterlist entry
    // 'Timetable: time table, table of time' resolved to Timetable.md.
    const entries: IndexEntry[] = [
      ["time table", "Timetable", "Timetable.md", "time table"],
      ["table of time", "Timetable", "Timetable.md", "table of time"],
    ].map(([term, canonical, path, alias]) => ({
      key: normalize(term, DEFAULT_SETTINGS.normalize),
      term,
      target: { canonical, path, alias },
    }));
    const idx = buildMatchIndex(entries);

    const r = linkContent(
      "the time table and the table of time",
      "Note.md",
      idx,
      { ...DEFAULT_SETTINGS, oneLinkPerFile: false },
    );
    expect(r.content).toBe(
      "the [[Timetable|time table]] and the [[Timetable|table of time]]",
    );
    // both replacements carry the alias for frontmatter backfill
    expect(r.replacements.every((x) => x.target.alias)).toBe(true);
  });
});

describe("linkContent", () => {
  it("reports no change when nothing matches", () => {
    const idx = indexOf([["Foo", "Foo", "foo.md"]]);
    const r = linkContent("nothing to see here", "c.md", idx, settings);
    expect(r.changed).toBe(false);
    expect(r.content).toBe("nothing to see here");
    expect(r.replacements).toHaveLength(0);
  });

  it("links and reports change + replacement count", () => {
    const idx = indexOf([["Foo", "Foo", "foo.md"]]);
    const r = linkContent("a Foo and a Foo", "c.md", idx, settings);
    expect(r.changed).toBe(true);
    expect(r.content).toBe("a [[Foo]] and a [[Foo]]");
    expect(r.replacements).toHaveLength(2);
  });

  it("honors the self-reference guard via sourcePath", () => {
    const idx = indexOf([["Foo", "Foo", "foo.md"]]);
    const r = linkContent("this is Foo", "foo.md", idx, settings);
    expect(r.changed).toBe(false);
  });

  it("respects oneLinkPerFile from settings", () => {
    const idx = indexOf([["Foo", "Foo", "foo.md"]]);
    const r = linkContent("Foo then Foo", "c.md", idx, { ...settings, oneLinkPerFile: true });
    expect(r.content).toBe("[[Foo]] then Foo");
  });
});
