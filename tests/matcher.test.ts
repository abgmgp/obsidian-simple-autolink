import { describe, it, expect } from "vitest";
import {
  buildMatchIndex,
  findReplacements,
  applyReplacements,
  IndexEntry,
  MatchOptions,
} from "../src/core/matcher";
import { computeSkipRanges, DEFAULT_SKIP_OPTIONS } from "../src/core/text-segmenter";
import { normalize, NormalizeOptions } from "../src/core/normalizer";

const NORM: NormalizeOptions = { caseInsensitive: true, matchBaseForm: false };

/** Build an index from [term, canonical, path] tuples. */
function index(terms: [string, string, string][]) {
  const entries: IndexEntry[] = terms.map(([term, canonical, path]) => ({
    key: normalize(term, NORM),
    term,
    target: { canonical, path },
  }));
  return buildMatchIndex(entries);
}

function opts(sourcePath = "Current.md", oneLinkPerFile = false): MatchOptions {
  return { normalize: NORM, oneLinkPerFile, sourcePath };
}

/** Full pipeline: segment + match + apply. */
function link(text: string, idx: ReturnType<typeof index>, o: MatchOptions): string {
  const skips = computeSkipRanges(text, DEFAULT_SKIP_OPTIONS);
  return applyReplacements(text, findReplacements(text, idx, skips, o));
}

describe("matcher basic", () => {
  it("links a plain title", () => {
    const idx = index([["Microservice", "Microservice", "Concepts/Microservice.md"]]);
    expect(link("I love Microservice design", idx, opts())).toBe(
      "I love [[Microservice]] design",
    );
  });

  it("is case-insensitive by default and aliases display text", () => {
    const idx = index([["Microservice", "Microservice", "m.md"]]);
    expect(link("study microservice now", idx, opts())).toBe(
      "study [[Microservice|microservice]] now",
    );
  });

  it("is word-boundary aware (no mid-word links)", () => {
    const idx = index([["Cat", "Cat", "c.md"]]);
    expect(link("concatenate the category", idx, opts())).toBe("concatenate the category");
  });
});

describe("matcher longest-match-first", () => {
  it("prefers the longer title (API Gateway over API)", () => {
    const idx = index([
      ["API", "API", "api.md"],
      ["API Gateway", "API Gateway", "gw.md"],
    ]);
    expect(link("the API Gateway routes", idx, opts())).toBe("the [[API Gateway]] routes");
  });

  it("still links the short title when the long one is absent", () => {
    const idx = index([
      ["API", "API", "api.md"],
      ["API Gateway", "API Gateway", "gw.md"],
    ]);
    expect(link("the API is down", idx, opts())).toBe("the [[API]] is down");
  });
});

describe("matcher guards", () => {
  it("never links a note to itself", () => {
    const idx = index([["Self", "Self", "Self.md"]]);
    expect(link("this is the Self note", idx, opts("Self.md"))).toBe("this is the Self note");
  });

  it("one-link-per-file links only first occurrence", () => {
    const idx = index([["Foo", "Foo", "foo.md"]]);
    const out = link("Foo and Foo again", idx, opts("c.md", true));
    expect(out).toBe("[[Foo]] and Foo again");
  });

  it("without one-per-file links every occurrence", () => {
    const idx = index([["Foo", "Foo", "foo.md"]]);
    expect(link("Foo and Foo again", idx, opts("c.md", false))).toBe(
      "[[Foo]] and [[Foo]] again",
    );
  });
});

describe("matcher honors skip ranges", () => {
  it("does not link inside code or existing links", () => {
    const idx = index([["Foo", "Foo", "foo.md"]]);
    const text = "Foo and `Foo` and [[Foo]] and Foo";
    const out = link(text, idx, opts("c.md", false));
    expect(out).toBe("[[Foo]] and `Foo` and [[Foo]] and [[Foo]]");
  });

  it("does not link inside frontmatter", () => {
    const idx = index([["Foo", "Foo", "foo.md"]]);
    const text = "---\ntags: Foo\n---\nbody Foo";
    expect(link(text, idx, opts())).toBe("---\ntags: Foo\n---\nbody [[Foo]]");
  });
});

describe("base-form matching", () => {
  it("links plural surface to singular note when enabled", () => {
    const baseNorm: NormalizeOptions = { caseInsensitive: true, matchBaseForm: true };
    const entries: IndexEntry[] = [
      {
        key: normalize("Microservice", baseNorm),
        term: "Microservice",
        target: { canonical: "Microservice", path: "m.md" },
      },
    ];
    const idx = buildMatchIndex(entries);
    const o: MatchOptions = { normalize: baseNorm, oneLinkPerFile: false, sourcePath: "c.md" };
    const skips = computeSkipRanges("we run microservices", DEFAULT_SKIP_OPTIONS);
    const out = applyReplacements(
      "we run microservices",
      findReplacements("we run microservices", idx, skips, o),
    );
    expect(out).toBe("we run [[Microservice|microservices]]");
  });
});

describe("applyReplacements", () => {
  it("is a no-op with no replacements", () => {
    expect(applyReplacements("hello", [])).toBe("hello");
  });
});
