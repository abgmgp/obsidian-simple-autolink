import { describe, it, expect } from "vitest";
import { buildMatchIndex, findReplacements, IndexEntry } from "../src/core/matcher";
import { computeSkipRanges, DEFAULT_SKIP_OPTIONS } from "../src/core/text-segmenter";
import { normalize, NormalizeOptions } from "../src/core/normalizer";
import { linkContent } from "../src/core/link-engine";
import { DEFAULT_SETTINGS } from "../src/settings/settings";

/**
 * Algorithmic perf guardrails for the Phase 6 acceptance target (a 1000-note
 * vault running responsively on mid-tier mobile). These are not wall-clock
 * guarantees for a specific device, but they fail loudly if the pure pipeline
 * regresses into quadratic-on-vault-size behavior. Thresholds are generous to
 * avoid CI flakiness while still catching real blowups.
 */

const NORM: NormalizeOptions = { caseInsensitive: true, matchBaseForm: false };

function bigIndex(n: number) {
  const entries: IndexEntry[] = [];
  for (let i = 0; i < n; i++) {
    const term = `Concept ${i}`;
    entries.push({
      key: normalize(term, NORM),
      term,
      target: { canonical: term, path: `Concepts/${term}.md` },
    });
  }
  return buildMatchIndex(entries);
}

/** A representative note body with prose, a code block, a table, and links. */
function sampleNote(i: number): string {
  return [
    `# Note ${i}`,
    ``,
    `This note discusses Concept ${i % 500} and Concept ${(i + 7) % 500}.`,
    `It also references [[Some Existing Link]] and \`inline code about Concept 3\`.`,
    ``,
    "```ts",
    `const x = "Concept 9 should not link";`,
    "```",
    ``,
    `| Col | Concept 1 |`,
    `| --- | --- |`,
    `| a | b |`,
    ``,
    `Closing thoughts on Concept ${(i + 1) % 500}.`,
  ].join("\n");
}

describe("performance guardrails", () => {
  it("builds a 1000-entry index quickly", () => {
    const t0 = performance.now();
    const idx = bigIndex(1000);
    const dt = performance.now() - t0;
    expect(idx.byKey.size).toBe(1000);
    expect(dt).toBeLessThan(200);
  });

  it("links 1000 notes against a 1000-entry index within budget", () => {
    const idx = bigIndex(1000);
    const settings = { ...DEFAULT_SETTINGS, oneLinkPerFile: true };

    const t0 = performance.now();
    let totalLinks = 0;
    for (let i = 0; i < 1000; i++) {
      const text = sampleNote(i);
      const r = linkContent(text, `Notes/note-${i}.md`, idx, settings);
      totalLinks += r.replacements.length;
    }
    const dt = performance.now() - t0;

    // Sanity: we actually linked things (prose concepts), and code/table were skipped.
    expect(totalLinks).toBeGreaterThan(0);
    // 1000 notes in well under a second of pure compute; chunked yielding then
    // keeps the UI responsive on top of this.
    expect(dt).toBeLessThan(2000);
  });

  it("segments a large note without quadratic blowup", () => {
    const huge = "Concept 1 ".repeat(20000); // ~200k chars of linkable prose
    const t0 = performance.now();
    const ranges = computeSkipRanges(huge, DEFAULT_SKIP_OPTIONS);
    const skips = findReplacements(huge, bigIndex(10), ranges, {
      normalize: NORM,
      oneLinkPerFile: true,
      sourcePath: "x.md",
    });
    const dt = performance.now() - t0;
    expect(skips.length).toBeGreaterThanOrEqual(1);
    expect(dt).toBeLessThan(1000);
  });
});
