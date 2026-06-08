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
      [{ canonical: "Timetable", aliases: ["time table", "tt"] }],
      resolve,
    );
    expect(unresolved).toEqual([]);
    expect(raw).toEqual([
      { term: "time table", path: "Concepts/Timetable.md", canonical: "Timetable", alias: "time table" },
      { term: "tt", path: "Concepts/Timetable.md", canonical: "Timetable", alias: "tt" },
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

  it("propagates folder/root scope into raw terms", () => {
    const { raw } = masterlistRawTerms(
      [
        { canonical: "Timetable", aliases: ["tt"], scope: "folder" },
        { canonical: "Timetable", aliases: ["table"], scope: "root" },
      ],
      resolve,
    );
    expect(raw).toEqual([
      { term: "tt", path: "Concepts/Timetable.md", canonical: "Timetable", alias: "tt", scope: "folder" },
      { term: "table", path: "Concepts/Timetable.md", canonical: "Timetable", alias: "table", scope: "root" },
    ]);
  });

  it("returns block directives for block: entries", () => {
    const { raw, blocks } = masterlistRawTerms(
      [
        { canonical: "Timetable", aliases: [], scope: "block" },
      ],
      resolve,
    );
    expect(raw).toEqual([]);
    expect(blocks).toEqual([
      { path: "Concepts/Timetable.md", allTerms: true, terms: new Set() },
    ]);
  });

  it("folder/root without aliases emits a scope directive (no raw terms)", () => {
    const { raw, scopes } = masterlistRawTerms(
      [
        { canonical: "Timetable", aliases: [], scope: "folder" },
      ],
      resolve,
    );
    expect(raw).toEqual([]);
    expect(scopes).toEqual([
      { path: "Concepts/Timetable.md", scope: "folder" },
    ]);
  });

  it("folder/root with aliases emits BOTH scoped raw terms AND a scope directive", () => {
    const { raw, scopes } = masterlistRawTerms(
      [
        { canonical: "Timetable", aliases: ["tt"], scope: "root" },
      ],
      resolve,
    );
    expect(raw).toHaveLength(1);
    expect(raw[0].scope).toBe("root");
    expect(scopes).toEqual([
      { path: "Concepts/Timetable.md", scope: "root" },
    ]);
  });

  it("block with aliases targets only those surface terms", () => {
    const { raw, blocks } = masterlistRawTerms(
      [
        { canonical: "Timetable", aliases: ["tt", "table"], scope: "block" },
      ],
      resolve,
    );
    expect(raw).toEqual([]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].path).toBe("Concepts/Timetable.md");
    expect(blocks[0].allTerms).toBe(false);
    expect([...blocks[0].terms].sort()).toEqual(["table", "tt"]);
  });
});
