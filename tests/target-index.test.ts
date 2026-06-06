import { describe, it, expect } from "vitest";
import {
  assembleEntries,
  normalizeAliasField,
  masterlistRawTerms,
  RawTerm,
} from "../src/core/target-index";
import { NormalizeOptions } from "../src/core/normalizer";

const NORM: NormalizeOptions = { caseInsensitive: true, matchBaseForm: false };

describe("normalizeAliasField", () => {
  it("handles arrays, strings, comma lists, and nullish", () => {
    expect(normalizeAliasField(["a", "b"])).toEqual(["a", "b"]);
    expect(normalizeAliasField("a, b ,c")).toEqual(["a", "b", "c"]);
    expect(normalizeAliasField("solo")).toEqual(["solo"]);
    expect(normalizeAliasField(undefined)).toEqual([]);
    expect(normalizeAliasField(null)).toEqual([]);
    expect(normalizeAliasField(42)).toEqual([]);
  });

  it("drops non-string array members", () => {
    expect(normalizeAliasField(["a", 1, null, "b"])).toEqual(["a", "b"]);
  });
});

describe("assembleEntries", () => {
  it("dedupes and reports cross-file collisions", () => {
    const raw: RawTerm[] = [
      { term: "Foo", path: "a.md", canonical: "Foo" },
      { term: "Foo", path: "b.md", canonical: "Foo (other)" },
    ];
    const { entries, collisions } = assembleEntries(raw, NORM);
    expect(collisions).toEqual(["foo"]);
    // last write wins
    expect(entries).toHaveLength(1);
    expect(entries[0].target.path).toBe("b.md");
  });

  it("does not flag same-file duplicate keys as collisions", () => {
    const raw: RawTerm[] = [
      { term: "Foo", path: "a.md", canonical: "Foo" },
      { term: "foo", path: "a.md", canonical: "Foo" },
    ];
    const { collisions } = assembleEntries(raw, NORM);
    expect(collisions).toEqual([]);
  });

  it("carries alias through to the target", () => {
    const raw: RawTerm[] = [
      { term: "time table", path: "tt.md", canonical: "Timetable", alias: "time table" },
    ];
    const { entries } = assembleEntries(raw, NORM);
    expect(entries[0].target.alias).toBe("time table");
    expect(entries[0].target.canonical).toBe("Timetable");
  });

  it("skips empty/whitespace keys", () => {
    const raw: RawTerm[] = [{ term: "   ", path: "x.md", canonical: "X" }];
    expect(assembleEntries(raw, NORM).entries).toHaveLength(0);
  });
});

describe("masterlistRawTerms", () => {
  const resolve = (name: string) =>
    name === "Timetable" ? { path: "Concepts/Timetable.md", basename: "Timetable" } : null;

  it("resolves canonicals to files and emits alias raw terms", () => {
    const { raw, unresolved } = masterlistRawTerms(
      [{ canonical: "Timetable", aliases: ["time table", "table of time"] }],
      resolve,
    );
    expect(unresolved).toEqual([]);
    expect(raw).toEqual([
      { term: "time table", path: "Concepts/Timetable.md", canonical: "Timetable", alias: "time table" },
      { term: "table of time", path: "Concepts/Timetable.md", canonical: "Timetable", alias: "table of time" },
    ]);
  });

  it("reports canonicals that resolve to no file", () => {
    const { raw, unresolved } = masterlistRawTerms(
      [{ canonical: "Ghost", aliases: ["spook"] }],
      resolve,
    );
    expect(raw).toEqual([]);
    expect(unresolved).toEqual(["Ghost"]);
  });
});
