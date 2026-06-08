import { describe, it, expect } from "vitest";
import { parseMasterlist, mergeAliasEntries } from "../src/core/alias-masterlist";

describe("parseMasterlist - scope prefixes", () => {
  it("parses vault-wide entries with no scope (back-compat)", () => {
    const { entries, problems } = parseMasterlist("Timetable: time table, tt");
    expect(problems).toEqual([]);
    expect(entries).toEqual([
      { canonical: "Timetable", aliases: ["time table", "tt"], scope: "vault" },
    ]);
  });

  it("recognizes scope keywords case-insensitively", () => {
    const text = [
      "BLOCK: View",
      "Folder: Notes: notes, nts",
      "root: View: view, views",
    ].join("\n");
    const { entries, problems } = parseMasterlist(text);
    expect(problems).toEqual([]);
    expect(entries).toEqual([
      { canonical: "View", aliases: [], scope: "block" },
      { canonical: "Notes", aliases: ["notes", "nts"], scope: "folder" },
      { canonical: "View", aliases: ["view", "views"], scope: "root" },
    ]);
  });

  it("accepts block entries with no aliases", () => {
    const { entries, problems } = parseMasterlist("block: View");
    expect(problems).toEqual([]);
    expect(entries).toEqual([{ canonical: "View", aliases: [], scope: "block" }]);
  });

  it("accepts block entries with explicit aliases (suppress only those terms)", () => {
    const { entries, problems } = parseMasterlist("block: View: vw, vws");
    expect(problems).toEqual([]);
    expect(entries).toEqual([
      { canonical: "View", aliases: ["vw", "vws"], scope: "block" },
    ]);
  });

  it("accepts folder/root entries with no aliases (re-scopes vault title)", () => {
    const { entries, problems } = parseMasterlist("folder: Notes\nroot: View");
    expect(problems).toEqual([]);
    expect(entries).toEqual([
      { canonical: "Notes", aliases: [], scope: "folder" },
      { canonical: "View", aliases: [], scope: "root" },
    ]);
  });

  it("still flags missing aliases for vault-wide entries", () => {
    const { entries, problems } = parseMasterlist("Notes:");
    expect(entries).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/no aliases listed for "Notes"/);
  });

  it("tolerates whitespace around every colon", () => {
    const variants = [
      "block:Note:alias",
      "block: Note: alias",
      "block : Note : alias",
      "  block  :  Note  :  alias  ",
    ];
    for (const v of variants) {
      const { entries, problems } = parseMasterlist(v);
      expect(problems).toEqual([]);
      expect(entries).toEqual([
        { canonical: "Note", aliases: ["alias"], scope: "block" },
      ]);
    }
  });

  it("treats an unknown prefix as part of the canonical (back-compat)", () => {
    // "foo:" is not a scope keyword; whole line parses as canonical=foo,
    // aliases=[bar].
    const { entries, problems } = parseMasterlist("foo: bar");
    expect(problems).toEqual([]);
    expect(entries).toEqual([
      { canonical: "foo", aliases: ["bar"], scope: "vault" },
    ]);
  });
});

describe("mergeAliasEntries - scope keying", () => {
  it("keeps entries with different scopes for the same canonical separate", () => {
    const merged = mergeAliasEntries([
      { canonical: "View", aliases: ["v"], scope: "vault" },
      { canonical: "View", aliases: [], scope: "block" },
    ]);
    expect(merged).toEqual([
      { canonical: "View", aliases: ["v"], scope: "vault" },
      { canonical: "View", aliases: [], scope: "block" },
    ]);
  });

  it("collapses duplicates within the same (canonical, scope)", () => {
    const merged = mergeAliasEntries([
      { canonical: "Notes", aliases: ["n"], scope: "folder" },
      { canonical: "Notes", aliases: ["n", "nts"], scope: "folder" },
    ]);
    expect(merged).toEqual([
      { canonical: "Notes", aliases: ["n", "nts"], scope: "folder" },
    ]);
  });
});
