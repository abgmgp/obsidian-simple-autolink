/**
 * Two independent transforms, both optional and controlled by NormalizeOptions:
 *  - case folding (lowercasing) for case-insensitive matching
 *  - base-form stripping
 *
 * The base-form rule is intentionally simple and conservative. It is NOT a
 * linguistically correct stemmer; it handles the common regular-plural cases
 * the build plan calls out (drop trailing `s`, `es`, `ies -> y`) and bails out
 * on short words to avoid mangling them.
 */

export interface NormalizeOptions {
  /** Lowercase before comparing. Default true (case-insensitive matching). */
  caseInsensitive: boolean;
  /** Apply the base-form (singularize) rule. Default false. */
  matchBaseForm: boolean;
}

export const DEFAULT_NORMALIZE_OPTIONS: NormalizeOptions = {
  caseInsensitive: true,
  matchBaseForm: false,
};

/**
 * Reduce a single word to its base (singular) form using a small set of
 * regular English pluralization rules. Operates on one token; callers that
 * have multi-word phrases should singularize per-word as appropriate.
 *
 * Rules (applied to the first match):
 *   ...ies  -> ...y     (categories -> category)   [stem must be >= 1 char]
 *   ...sses -> ...ss    (classes -> class, buses stays via -es below)
 *   ...shes -> ...sh    (dishes -> dish)
 *   ...ches -> ...ch    (matches -> match)
 *   ...xes  -> ...x     (boxes -> box)
 *   ...zes  -> ...z     (quizzes handled crudely)
 *   ...s    -> ...      (cats -> cat)               [not ...ss, not too short]
 *
 * Words of length <= 3 are returned unchanged (e.g. "is", "as", "gas").
 */
export function baseForm(word: string): string {
  if (word.length <= 3) return word;

  if (word.endsWith("ies") && word.length > 4) {
    return word.slice(0, -3) + "y";
  }
  if (word.endsWith("sses") || word.endsWith("shes") || word.endsWith("ches")) {
    return word.slice(0, -2);
  }
  if (word.endsWith("xes") || word.endsWith("zes")) {
    return word.slice(0, -2);
  }
  // plain trailing -s, but never strip from "...ss" (class, address)
  if (word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Normalize a full term (which may be multiple words) for index keys and
 * for comparison. Applies case folding and, if enabled, base-form stripping
 * to each whitespace-delimited word.
 */
export function normalize(term: string, opts: NormalizeOptions): string {
  let out = term;
  if (opts.caseInsensitive) {
    out = out.toLowerCase();
  }
  if (opts.matchBaseForm) {
    out = out
      .split(/(\s+)/) // keep separators so spacing is preserved
      .map((tok) => (/\s/.test(tok) ? tok : baseForm(tok)))
      .join("");
  }
  return out;
}
