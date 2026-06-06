/**
 * Build the matcher index from the vault.
 *
 * This is the seam between Obsidian and the pure core. It reads markdown files
 * and their frontmatter aliases via the MetadataCache, then emits IndexEntry[]
 * that the pure matcher consumes. All normalization is shared with the matcher
 * so keys line up exactly.
 *
 */

import { App, TFile } from "obsidian";
import { normalize, NormalizeOptions } from "./normalizer";
import { IndexEntry, LinkTarget } from "./matcher";

export interface BuildIndexResult {
  entries: IndexEntry[];
  /** Keys that collided across different target files (last write won). */
  collisions: string[];
}

/**
 * A normalized term and the file it belongs to, before collision resolution.
 * Exported for unit testing the pure assembly step without Obsidian.
 */
export interface RawTerm {
  term: string;
  path: string;
  canonical: string;
  alias?: string;
}

/**
 * Pure assembly: given raw terms and normalization options, produce deduped
 * IndexEntry[] and report collisions. Last write wins on key collision, but a
 * term never collides with itself (same path) — that's not a real conflict.
 */
export function assembleEntries(
  raw: RawTerm[],
  opts: NormalizeOptions,
): BuildIndexResult {
  const byKey = new Map<string, IndexEntry>();
  const collisions: string[] = [];

  for (const r of raw) {
    const key = normalize(r.term, opts);
    if (key.trim() === "") continue;

    const target: LinkTarget = { canonical: r.canonical, path: r.path };
    if (r.alias !== undefined) target.alias = r.alias;

    const existing = byKey.get(key);
    if (existing && existing.target.path !== r.path) {
      collisions.push(key);
    }
    byKey.set(key, { key, term: r.term, target });
  }

  return { entries: [...byKey.values()], collisions };
}

/**
 * Read titles + frontmatter aliases from the vault into RawTerm[].
 * Caller is responsible for path include/exclude filtering.
 */
export function collectRawTerms(app: App, files: TFile[]): RawTerm[] {
  const raw: RawTerm[] = [];
  for (const file of files) {
    const canonical = file.basename;
    raw.push({ term: canonical, path: file.path, canonical });

    const cache = app.metadataCache.getFileCache(file);
    const aliases = normalizeAliasField(cache?.frontmatter?.aliases);
    for (const alias of aliases) {
      if (alias.trim() === "") continue;
      raw.push({ term: alias, path: file.path, canonical, alias });
    }
  }
  return raw;
}

/**
 * Frontmatter `aliases:` can be a string, a comma list, or a YAML array.
 * Normalize all shapes to a string[]. Pure — exported for testing.
 */
export function normalizeAliasField(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string") {
    // A single scalar may itself be a comma-separated list.
    return value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
  }
  return [];
}

import { AliasEntry } from "./alias-masterlist";

/**
 * Convert masterlist alias entries into RawTerm[] by resolving each canonical
 * name to a file. `resolve(name)` returns the file's {path, basename} or null
 * if no such note exists. Unresolved canonicals are returned as `unresolved`
 * so the caller can surface them. Pure — exported for testing.
 */
export function masterlistRawTerms(
  entries: AliasEntry[],
  resolve: (canonical: string) => { path: string; basename: string } | null,
): { raw: RawTerm[]; unresolved: string[] } {
  const raw: RawTerm[] = [];
  const unresolved: string[] = [];
  for (const entry of entries) {
    const file = resolve(entry.canonical);
    if (!file) {
      unresolved.push(entry.canonical);
      continue;
    }
    for (const alias of entry.aliases) {
      if (alias.trim() === "") continue;
      raw.push({ term: alias, path: file.path, canonical: file.basename, alias });
    }
  }
  return { raw, unresolved };
}

/**
 * Convenience: build the full index result directly from the vault, optionally
 * layering in masterlist aliases. Masterlist terms are appended after vault
 * terms, so on a key collision the masterlist wins (last write wins in
 * assembleEntries) — intended, since the masterlist is the user's override.
 */
export function buildIndex(
  app: App,
  files: TFile[],
  opts: NormalizeOptions,
  masterlist: AliasEntry[] = [],
): BuildIndexResult & { unresolved: string[] } {
  const raw = collectRawTerms(app, files);

  // Resolve masterlist canonicals only against in-scope files.
  const byBasename = new Map<string, { path: string; basename: string }>();
  for (const f of files) {
    if (!byBasename.has(f.basename)) {
      byBasename.set(f.basename, { path: f.path, basename: f.basename });
    }
  }
  const { raw: mlRaw, unresolved } = masterlistRawTerms(masterlist, (name) =>
    byBasename.get(name) ?? null,
  );

  const result = assembleEntries([...raw, ...mlRaw], opts);
  return { ...result, unresolved };
}
