/**
 * Minimal stub of the `obsidian` runtime for unit tests. The real module is
 * provided by the Obsidian app at runtime and has no resolvable entry point,
 * so tests alias `obsidian` to this file (see vitest.config.ts).
 *
 * Only the surface the pure-adjacent triggers touch is implemented. Anything
 * else should stay out of unit-tested code paths.
 */

export class TAbstractFile {
  path = "";
}

export class TFile extends TAbstractFile {
  extension = "md";
  basename = "";
}

export type EventRef = { name: string };

/**
 * Synchronous passthrough "debounce": invokes immediately. Real timing is
 * exercised via Vitest fake timers where needed; tests that need true debounce
 * semantics should drive timers explicitly.
 */
export function debounce<T extends unknown[]>(
  cb: (...args: T) => unknown,
): (...args: T) => void {
  return (...args: T) => {
    cb(...args);
  };
}

// Placeholders so imports resolve even if referenced indirectly.
export class Notice {
  constructor(_message: string, _timeout?: number) {}
  setMessage(_m: string): void {}
  hide(): void {}
}

export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class App {}
