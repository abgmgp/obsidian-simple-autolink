import { describe, it, expect } from "vitest";
import { isExcalidrawPath, isInScope, matchesAny } from "../src/util/glob";

describe("isExcalidrawPath", () => {
  it("matches the .excalidraw.md suffix in any folder", () => {
    expect(isExcalidrawPath("Foo.excalidraw.md")).toBe(true);
    expect(isExcalidrawPath("nested/dir/Foo.excalidraw.md")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isExcalidrawPath("Foo.Excalidraw.MD")).toBe(true);
    expect(isExcalidrawPath("FOO.EXCALIDRAW.MD")).toBe(true);
  });

  it("does not match plain markdown or partial suffixes", () => {
    expect(isExcalidrawPath("Foo.md")).toBe(false);
    expect(isExcalidrawPath("Foo.excalidraw")).toBe(false);
    expect(isExcalidrawPath("excalidrawmd")).toBe(false);
    expect(isExcalidrawPath("Foo-excalidraw.md")).toBe(false);
  });
});

describe("isInScope excalidraw carve-out", () => {
  it("excludes excalidraw files even with empty include/exclude lists", () => {
    expect(isInScope("Drawings/Sketch.excalidraw.md", [], [])).toBe(false);
  });

  it("excludes excalidraw files even when an include pattern matches them", () => {
    expect(isInScope("Drawings/Sketch.excalidraw.md", ["Drawings/**"], [])).toBe(false);
  });

  it("still includes ordinary notes in the same folder", () => {
    expect(isInScope("Drawings/Notes.md", ["Drawings/**"], [])).toBe(true);
  });
});

describe("matchesAny", () => {
  it("returns false on an empty list", () => {
    expect(matchesAny("Foo.md", [])).toBe(false);
  });
});
