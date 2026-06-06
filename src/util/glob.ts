/**
 * Minimal glob matcher for folder include/exclude lists. Pure — no imports.
 *
 * Supports the subset of glob people actually use for vault paths:
 *   *   matches any run of characters except "/"
 *   **  matches any run of characters including "/" (spanning folders)
 *   ?   matches a single non-"/" character
 * Everything else is literal. Matching is anchored to the whole path.
 *
 * Paths are Obsidian vault-relative with "/" separators and no leading slash,
 * e.g. "Concepts/API Gateway.md". A bare folder pattern like "Archive" is
 * treated as "Archive/**" so users can list a folder and have its contents
 * excluded without remembering the glob suffix.
 */

/** Convert one glob pattern to an anchored RegExp. */
export function globToRegExp(glob: string): RegExp {
  const pattern = expandFolderShorthand(glob);
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        // ** => match across separators
        re += ".*";
        i++;
        // consume an optional trailing slash so "a/**" matches "a/b" and "a/"
        if (pattern[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += escapeRegExp(c);
    }
  }
  return new RegExp(`^${re}$`);
}

/**
 * A pattern with no glob metacharacters and no "." (i.e. a plain folder name or
 * path) is expanded to also match everything beneath it.
 */
function expandFolderShorthand(glob: string): string {
  const trimmed = glob.replace(/\/+$/, "");
  const hasMeta = /[*?]/.test(trimmed);
  const looksLikeFile = /\.[^/]+$/.test(trimmed);
  if (!hasMeta && !looksLikeFile && trimmed !== "") {
    return `${trimmed}/**`;
  }
  return trimmed;
}

function escapeRegExp(c: string): string {
  return c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

/** True if `path` matches any pattern in the list. Empty list => false. */
export function matchesAny(path: string, globs: string[]): boolean {
  for (const g of globs) {
    const trimmed = g.trim();
    if (trimmed === "") continue;
    if (globToRegExp(trimmed).test(path)) return true;
  }
  return false;
}

/**
 * Decide whether a path is in scope given include/exclude lists.
 * Rules:
 *  - Empty include list => everything is included (then exclude applies).
 *  - Non-empty include list => path must match an include pattern.
 *  - Exclude always wins over include.
 */
export function isInScope(path: string, includeGlobs: string[], excludeGlobs: string[]): boolean {
  if (matchesAny(path, excludeGlobs)) return false;
  if (includeGlobs.some((g) => g.trim() !== "")) {
    return matchesAny(path, includeGlobs);
  }
  return true;
}
