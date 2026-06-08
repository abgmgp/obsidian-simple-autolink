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
import type { AliasScope } from "./alias-masterlist";

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
  /** Scope inherited from a masterlist entry (vault-wide when omitted). */
  scope?: AliasScope;
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
    if (r.scope !== undefined && r.scope !== "vault") target.scope = r.scope;

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
 * A directive that suppresses terms emitted by `collectRawTerms` for a given
 * file path. `allTerms` blocks the file's title and all its frontmatter
 * aliases; otherwise only `terms` (case-sensitive surface forms) are blocked.
 */
export interface BlockDirective {
  path: string;
  allTerms: boolean;
  terms: Set<string>;
}

/**
 * Re-scopes a vault-side file's title and frontmatter aliases to a non-vault
 * scope. Emitted by `folder:` / `root:` masterlist entries.
 */
export interface ScopeDirective {
  path: string;
  scope: AliasScope;
}

/**
 * Convert masterlist alias entries into RawTerm[] by resolving each canonical
 * name to a file. `resolve(name)` returns the file's {path, basename} or null
 * if no such note exists. Unresolved canonicals are returned as `unresolved`
 * so the caller can surface them. `blocks` describes which vault-side raw
 * terms should be suppressed because of `block:` entries.
 *
 * Pure — exported for testing.
 */
export function masterlistRawTerms(
  entries: AliasEntry[],
  resolve: (canonical: string) => { path: string; basename: string } | null,
): {
  raw: RawTerm[];
  unresolved: string[];
  blocks: BlockDirective[];
  scopes: ScopeDirective[];
} {
  const raw: RawTerm[] = [];
  const unresolved: string[] = [];
  const blocksByPath = new Map<string, BlockDirective>();
  const scopesByPath = new Map<string, ScopeDirective>();

  for (const entry of entries) {
    const file = resolve(entry.canonical);
    if (!file) {
      unresolved.push(entry.canonical);
      continue;
    }

    if (entry.scope === "block") {
      let directive = blocksByPath.get(file.path);
      if (!directive) {
        directive = { path: file.path, allTerms: false, terms: new Set() };
        blocksByPath.set(file.path, directive);
      }
      if (entry.aliases.length === 0) {
        directive.allTerms = true;
      } else {
        for (const alias of entry.aliases) {
          if (alias.trim() === "") continue;
          directive.terms.add(alias);
        }
      }
      continue;
    }

    if (entry.scope === "folder" || entry.scope === "root") {
      // Re-scope the vault-side title + frontmatter aliases for this file.
      // Last write wins if the same path has multiple scope entries.
      scopesByPath.set(file.path, { path: file.path, scope: entry.scope });
    }

    for (const alias of entry.aliases) {
      if (alias.trim() === "") continue;
      raw.push({
        term: alias,
        path: file.path,
        canonical: file.basename,
        alias,
        scope: entry.scope,
      });
    }
  }
  return {
    raw,
    unresolved,
    blocks: [...blocksByPath.values()],
    scopes: [...scopesByPath.values()],
  };
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

  // Resolve masterlist canonicals only against in-scope files. Resolution is
  // case-insensitive so a user-typed `root: view: views` still finds View.md;
  // the file's actual basename is what we record as the canonical.
  const byBasename = new Map<string, { path: string; basename: string }>();
  for (const f of files) {
    const key = f.basename.toLowerCase();
    if (!byBasename.has(key)) {
      byBasename.set(key, { path: f.path, basename: f.basename });
    }
  }
  const { raw: mlRaw, unresolved, blocks, scopes } = masterlistRawTerms(masterlist, (name) =>
    byBasename.get(name.toLowerCase()) ?? null,
  );

  // Apply block directives: drop any vault-side raw term (title or frontmatter
  // alias) that a `block:` entry suppresses for the same file path. Comparison
  // uses the matcher's normalize() so that case folding and base-form stripping
  // line up — otherwise `block: View: views` would fail to suppress the
  // canonical `View` raw term, and a surface "views" would still link via the
  // collapsed `view` key under matchBaseForm.
  const blockedByPath = new Map<string, BlockDirective>();
  for (const b of blocks) blockedByPath.set(b.path, b);
  const blockedKeysByPath = new Map<string, Set<string>>();
  for (const b of blocks) {
    if (b.allTerms) continue;
    const keys = new Set<string>();
    for (const t of b.terms) keys.add(normalize(t, opts));
    blockedKeysByPath.set(b.path, keys);
  }
  const filteredRaw = blockedByPath.size === 0
    ? raw
    : raw.filter((r) => {
        const b = blockedByPath.get(r.path);
        if (!b) return true;
        if (b.allTerms) return false;
        const keys = blockedKeysByPath.get(r.path);
        if (!keys) return true;
        return !keys.has(normalize(r.term, opts));
      });

  // Apply scope directives from `folder:` / `root:` masterlist entries: any
  // vault-side raw term (canonical title or frontmatter alias) for the named
  // file gets re-scoped. Masterlist alias raw terms already carry their scope.
  const scopeByPath = new Map<string, AliasScope>();
  for (const s of scopes) scopeByPath.set(s.path, s.scope);
  const scopedRaw = scopeByPath.size === 0
    ? filteredRaw
    : filteredRaw.map((r) => {
        const s = scopeByPath.get(r.path);
        return s ? { ...r, scope: s } : r;
      });

  const result = assembleEntries([...scopedRaw, ...mlRaw], opts);
  return { ...result, unresolved };
}
