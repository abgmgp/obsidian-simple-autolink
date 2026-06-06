/**
 * Tiny prefixed logger. Pure — no Obsidian imports.
 * Levels gate noisy output; default is "info".
 */
export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

const ORDER: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

const PREFIX = "[auto-link]";

export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = "info") {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private enabled(level: Exclude<LogLevel, "silent">): boolean {
    return ORDER[this.level] >= ORDER[level];
  }

  error(...args: unknown[]): void {
    if (this.enabled("error")) console.error(PREFIX, ...args);
  }

  warn(...args: unknown[]): void {
    if (this.enabled("warn")) console.warn(PREFIX, ...args);
  }

  info(...args: unknown[]): void {
    if (this.enabled("info")) console.log(PREFIX, ...args);
  }

  debug(...args: unknown[]): void {
    if (this.enabled("debug")) console.debug(PREFIX, ...args);
  }
}
