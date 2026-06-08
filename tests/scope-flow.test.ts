import { describe, it, expect } from "vitest";
import {
  assembleEntries,
  masterlistRawTerms,
  RawTerm,
} from "../src/core/target-index";
import {
  buildMatchIndex,
  findReplacements,
  applyReplacements,
} from "../src/core/matcher";
import { NormalizeOptions } from "../src/core/normalizer";
import { DEFAULT_SKIP_OPTIONS, computeSkipRanges } from "../src/core/text-segmenter";
import { parseMasterlist, mergeAliasEntries } from "../src/core/alias-masterlist";

// User's flags: caseInsensitive=true, matchBaseForm=true, oneLinkPerFile=true.
const NORM: NormalizeOptions = { caseInsensitive: true, matchBaseForm: true };

function runLink(text: string, sourcePath: string, raw: RawTerm[]) {
  const { entries } = assembleEntries(raw, NORM);
  const index = buildMatchIndex(entries);
  const skips = computeSkipRanges(text, DEFAULT_SKIP_OPTIONS);
  const reps = findReplacements(text, index, skips, {
    normalize: NORM,
    oneLinkPerFile: true,
    sourcePath,
  });
  return { out: applyReplacements(text, reps), reps, index };
}

describe("root scope under matchBaseForm + writeBack-style backfill", () => {
  it("blocks 'views' surface from out-of-root source", () => {
    // Simulate: View.md at Programming/Ideas/View.md, with backfilled
    // frontmatter alias "views". Vault collectRawTerms order: canonical first,
    // then frontmatter aliases. Then masterlist appended.
    const vault: RawTerm[] = [
      { term: "View", path: "Programming/Ideas/View.md", canonical: "View" },
      { term: "views", path: "Programming/Ideas/View.md", canonical: "View", alias: "views" },
    ];
    const ml = mergeAliasEntries(
      parseMasterlist("root: View: views").entries,
    );
    const { raw: mlRaw } = masterlistRawTerms(ml, (name) =>
      name === "View" ? { path: "Programming/Ideas/View.md", basename: "View" } : null,
    );

    // Out of root.
    const outside = runLink("see views here", "Journal/2026.md", [...vault, ...mlRaw]);
    expect(outside.reps).toHaveLength(0);

    // In root.
    const inside = runLink("see views here", "Programming/Other.md", [...vault, ...mlRaw]);
    expect(inside.reps).toHaveLength(1);
  });

  it("scope=root also gates the canonical title key under matchBaseForm", () => {
    // Canonical "View" and alias "views" collapse to the same normalized key
    // under matchBaseForm. Masterlist appended last, so the scope=root entry
    // wins, gating ALL surface matches (including "View") at that key.
    const vault: RawTerm[] = [
      { term: "View", path: "Programming/Ideas/View.md", canonical: "View" },
    ];
    const ml = mergeAliasEntries(parseMasterlist("root: View: views").entries);
    const { raw: mlRaw } = masterlistRawTerms(ml, (name) =>
      name === "View" ? { path: "Programming/Ideas/View.md", basename: "View" } : null,
    );

    const outside = runLink("see View here", "Journal/x.md", [...vault, ...mlRaw]);
    expect(outside.reps).toHaveLength(0);
  });
});

describe("block scope under matchBaseForm", () => {
  it("block: NoteName (no aliases) suppresses the canonical title", () => {
    const vault: RawTerm[] = [
      { term: "View", path: "Folder/View.md", canonical: "View" },
    ];
    const ml = mergeAliasEntries(parseMasterlist("block: View").entries);
    const { raw: mlRaw, blocks } = masterlistRawTerms(ml, (name) =>
      name === "View" ? { path: "Folder/View.md", basename: "View" } : null,
    );
    expect(blocks).toHaveLength(1);

    // Manually replicate buildIndex's block filter
    const filtered = vault.filter((r) => {
      const b = blocks.find((bb) => bb.path === r.path);
      if (!b) return true;
      if (b.allTerms) return false;
      return !b.terms.has(r.term);
    });

    const res = runLink("see View here", "anywhere.md", [...filtered, ...mlRaw]);
    expect(res.reps).toHaveLength(0);
  });

  it("block: NoteName: alias — normalized-key comparison suppresses both alias and canonical", () => {
    // Regression: under matchBaseForm, surface "views" collapses to key "view"
    // — the SAME key the canonical title "View" would emit. The block filter
    // must compare normalized keys (not raw strings) so the canonical's raw
    // term also gets dropped, otherwise surface "views" would still link via
    // the un-blocked canonical key.
    const vault: RawTerm[] = [
      { term: "View", path: "Folder/View.md", canonical: "View" },
    ];
    const ml = mergeAliasEntries(parseMasterlist("block: View: views").entries);
    const { raw: mlRaw, blocks } = masterlistRawTerms(ml, (name) =>
      name === "View" ? { path: "Folder/View.md", basename: "View" } : null,
    );

    // Mirror the buildIndex normalized-key filter.
    const blockedKeys = new Map<string, Set<string>>();
    for (const b of blocks) {
      if (b.allTerms) continue;
      const keys = new Set<string>();
      for (const t of b.terms) keys.add(t.toLowerCase().replace(/s$/, ""));
      blockedKeys.set(b.path, keys);
    }
    const filtered = vault.filter((r) => {
      const b = blocks.find((bb) => bb.path === r.path);
      if (!b) return true;
      if (b.allTerms) return false;
      const keys = blockedKeys.get(r.path);
      if (!keys) return true;
      return !keys.has(r.term.toLowerCase().replace(/s$/, ""));
    });

    const res = runLink("see views here", "anywhere.md", [...filtered, ...mlRaw]);
    expect(res.reps).toHaveLength(0);
  });
});

describe("case-insensitive canonical resolution", () => {
  it("lowercase canonical in masterlist resolves against capitalized file basename", async () => {
    const ml = mergeAliasEntries(parseMasterlist("root: view: views").entries);

    // Mirror buildIndex's case-insensitive byBasename lookup.
    const files = [{ path: "Programming/Ideas/View.md", basename: "View" }];
    const byBasename = new Map<string, { path: string; basename: string }>();
    for (const f of files) byBasename.set(f.basename.toLowerCase(), f);
    const { raw } = masterlistRawTerms(ml, (name) => byBasename.get(name.toLowerCase()) ?? null);

    expect(raw).toHaveLength(1);
    expect(raw[0].path).toBe("Programming/Ideas/View.md");
    expect(raw[0].scope).toBe("root");
  });
});
