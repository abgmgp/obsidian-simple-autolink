import { describe, it, expect } from "vitest";
import { globToRegExp, matchesAny, isInScope } from "../src/util/glob";

describe("globToRegExp", () => {
  it("matches * within a segment but not across /", () => {
    expect(globToRegExp("*.md").test("Note.md")).toBe(true);
    expect(globToRegExp("*.md").test("a/Note.md")).toBe(false);
  });

  it("matches ** across segments", () => {
    expect(globToRegExp("Archive/**").test("Archive/2024/old.md")).toBe(true);
    expect(globToRegExp("**/draft.md").test("a/b/draft.md")).toBe(true);
  });

  it("matches ? as a single non-slash char", () => {
    expect(globToRegExp("note?.md").test("note1.md")).toBe(true);
    expect(globToRegExp("note?.md").test("note12.md")).toBe(false);
  });

  it("expands a bare folder name to folder/**", () => {
    expect(globToRegExp("Archive").test("Archive/x.md")).toBe(true);
    expect(globToRegExp("Archive").test("Archiveable/x.md")).toBe(false);
  });

  it("treats a path with an extension as a literal file", () => {
    expect(globToRegExp("Inbox/todo.md").test("Inbox/todo.md")).toBe(true);
    expect(globToRegExp("Inbox/todo.md").test("Inbox/todo.md.bak")).toBe(false);
  });
});

describe("matchesAny", () => {
  it("ignores blank patterns", () => {
    expect(matchesAny("a.md", ["", "  "])).toBe(false);
    expect(matchesAny("a.md", ["", "*.md"])).toBe(true);
  });
});

describe("isInScope", () => {
  it("includes everything when include list is empty", () => {
    expect(isInScope("any/path.md", [], [])).toBe(true);
  });

  it("requires an include match when include list is non-empty", () => {
    expect(isInScope("Concepts/x.md", ["Concepts"], [])).toBe(true);
    expect(isInScope("Inbox/x.md", ["Concepts"], [])).toBe(false);
  });

  it("exclude wins over include", () => {
    expect(isInScope("Concepts/secret.md", ["Concepts"], ["**/secret.md"])).toBe(false);
  });

  it("treats whitespace-only include list as empty", () => {
    expect(isInScope("any.md", ["   "], [])).toBe(true);
  });
});
