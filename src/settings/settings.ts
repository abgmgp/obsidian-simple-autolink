/**
 * Settings interface + defaults
 * this file defines the shape so triggers and the index can consume it now.
 */

import { NormalizeOptions } from "../core/normalizer";
import { SkipOptions, DEFAULT_SKIP_OPTIONS } from "../core/text-segmenter";

export interface AutoLinkSettings {
  /** Case + base-form matching behavior. */
  normalize: NormalizeOptions;
  /** Which markdown elements to skip when linking. */
  skip: SkipOptions;
  /** Link each unique target at most once per file (first occurrence wins). */
  oneLinkPerFile: boolean;
  /** Run auto-link on note save. */
  onSave: boolean;
  /** Glob patterns of folders to include. Empty = whole vault. */
  includeGlobs: string[];
  /** Glob patterns of folders to exclude. */
  excludeGlobs: string[];
  /** Master switch for the alias masterlist feature. */
  masterlistEnabled: boolean;
  /** Vault path to the alias masterlist file. Preserved even when disabled. */
  masterlistPath: string;
  /** Backfill matched masterlist aliases into target notes' frontmatter. */
  writeBackAliases: boolean;
}

export const DEFAULT_SETTINGS: AutoLinkSettings = {
  normalize: { caseInsensitive: true, matchBaseForm: false },
  skip: { ...DEFAULT_SKIP_OPTIONS },
  oneLinkPerFile: true,
  onSave: false,
  includeGlobs: [],
  excludeGlobs: [],
  masterlistEnabled: false,
  masterlistPath: "",
  writeBackAliases: true,
};
