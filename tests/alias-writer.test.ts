import { describe, it, expect } from "vitest";
import { aliasesToAdd } from "../src/core/alias-writer";
import { aliasesByTarget } from "../src/core/link-engine";
import { Replacement } from "../src/core/matcher";

describe("aliasesToAdd", () => {
  it("returns aliases missing from existing frontmatter", () => {
    expect(aliasesToAdd(["time table"], ["time table", "table of time"])).toEqual([
      "table of time",
    ]);
  });

  it("handles string and comma-list existing values", () => {
    expect(aliasesToAdd("a, b", ["b", "c"])).toEqual(["c"]);
  });

  it("treats null/undefined existing as empty", () => {
    expect(aliasesToAdd(undefined, ["x"])).toEqual(["x"]);
    expect(aliasesToAdd(null, ["x"])).toEqual(["x"]);
  });

  it("dedupes within wanted and skips blanks", () => {
    expect(aliasesToAdd([], ["a", "a", "  ", "b"])).toEqual(["a", "b"]);
  });
});

describe("aliasesByTarget", () => {
  const r = (path: string, alias?: string): Replacement => ({
    start: 0,
    end: 1,
    matched: "x",
    target: { canonical: "C", path, ...(alias ? { alias } : {}) },
    link: "[[C]]",
  });

  it("groups alias surface forms by target path", () => {
    const map = aliasesByTarget([
      r("a.md", "alpha"),
      r("a.md", "alef"),
      r("b.md", "beta"),
      r("c.md"), // title match, no alias
    ]);
    expect([...map.get("a.md")!]).toEqual(["alpha", "alef"]);
    expect([...map.get("b.md")!]).toEqual(["beta"]);
    expect(map.has("c.md")).toBe(false);
  });
});
