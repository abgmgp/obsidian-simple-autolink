import { describe, it, expect } from "vitest";
import {
  parseMasterlist,
  mergeAliasEntries,
  MASTERLIST_TEMPLATE,
} from "../src/core/alias-masterlist";

describe("parseMasterlist", () => {
  it("parses canonical: alias lists", () => {
    const { entries, problems } = parseMasterlist(
      "Timetable: time table, table of time\nAPI Gateway: gateway, api gw",
    );
    expect(problems).toEqual([]);
    expect(entries).toEqual([
      { canonical: "Timetable", aliases: ["time table", "table of time"] },
      { canonical: "API Gateway", aliases: ["gateway", "api gw"] },
    ]);
  });

  it("ignores blanks and # comments", () => {
    const { entries } = parseMasterlist("\n# a comment\nFoo: bar\n   \n");
    expect(entries).toEqual([{ canonical: "Foo", aliases: ["bar"] }]);
  });

  it("reports lines without a colon", () => {
    const { entries, problems } = parseMasterlist("no colon here\nFoo: bar");
    expect(entries).toHaveLength(1);
    expect(problems[0]).toContain("Line 1");
    expect(problems[0]).toContain("missing ':'");
  });

  it("reports empty canonical and empty alias list", () => {
    const { problems } = parseMasterlist(": orphan\nFoo:   ,  ,");
    expect(problems[0]).toContain("Line 1");
    expect(problems[0]).toContain("empty canonical");
    expect(problems[1]).toContain("Line 2");
    expect(problems[1]).toContain("no aliases");
  });

  it("preserves spaces and colons inside aliases after the first colon", () => {
    const { entries } = parseMasterlist("Ratio: 1:1, aspect ratio");
    expect(entries[0].aliases).toEqual(["1:1", "aspect ratio"]);
  });
});

describe("MASTERLIST_TEMPLATE", () => {
  it("parses without problems and yields example entries", () => {
    const { entries, problems } = parseMasterlist(MASTERLIST_TEMPLATE);
    expect(problems).toEqual([]);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map((e) => e.canonical)).toContain("Timetable");
  });
});

describe("mergeAliasEntries", () => {
  it("merges duplicate canonicals and dedupes aliases", () => {
    const merged = mergeAliasEntries([
      { canonical: "Foo", aliases: ["a", "b"] },
      { canonical: "Foo", aliases: ["b", "c"] },
      { canonical: "Bar", aliases: ["x"] },
    ]);
    expect(merged).toEqual([
      { canonical: "Foo", aliases: ["a", "b", "c"] },
      { canonical: "Bar", aliases: ["x"] },
    ]);
  });
});
