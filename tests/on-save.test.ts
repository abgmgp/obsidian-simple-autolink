import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TFile } from "obsidian";
import { OnSaveTrigger, OnSaveDeps } from "../src/triggers/on-save";
import { buildMatchIndex, IndexEntry } from "../src/core/matcher";
import { normalize } from "../src/core/normalizer";
import { DEFAULT_SETTINGS } from "../src/settings/settings";
import { Logger } from "../src/util/logger";

/**
 * These tests exercise the on-save trigger against a hand-rolled fake of the
 * slice of the Obsidian vault API it uses. `obsidian` is aliased to the stub in
 * tests/__mocks__/obsidian.ts (see vitest.config.ts), whose debounce is a
 * synchronous passthrough so the async process step runs deterministically.
 */

function makeFile(path: string): TFile {
  const f = new TFile();
  f.path = path;
  f.extension = "md";
  return f;
}

function indexOf(terms: [string, string, string][]) {
  const entries: IndexEntry[] = terms.map(([term, canonical, path]) => ({
    key: normalize(term, DEFAULT_SETTINGS.normalize),
    term,
    target: { canonical, path },
  }));
  return buildMatchIndex(entries);
}

interface FakeVault {
  modify: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  offref: ReturnType<typeof vi.fn>;
  _handler?: (file: TFile) => void;
}

function makeDeps(content: string, onSave = true): {
  deps: OnSaveDeps;
  vault: FakeVault;
} {
  const store = new Map<string, string>();
  const vault: FakeVault = {
    modify: vi.fn(async (f: TFile, data: string) => {
      store.set(f.path, data);
      // Simulate Obsidian dispatching a modify event for our own write.
      vault._handler?.(f);
    }),
    read: vi.fn(async (f: TFile) => store.get(f.path) ?? content),
    on: vi.fn((_name: string, handler: (file: TFile) => void) => {
      vault._handler = handler;
      return { name: "modify" };
    }),
    offref: vi.fn(),
  };
  const deps: OnSaveDeps = {
    app: { vault } as never,
    log: new Logger("silent"),
    getSettings: () => ({ ...DEFAULT_SETTINGS, onSave, oneLinkPerFile: false }),
    getIndex: () => indexOf([["Foo", "Foo", "foo.md"]]),
    inScope: () => true,
  };
  return { deps, vault };
}

describe("OnSaveTrigger", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("links once on modify and does not loop on its own write", async () => {
    const { deps, vault } = makeDeps("note about Foo", true);
    const trigger = new OnSaveTrigger(deps);
    trigger.enable();

    // Fire the modify event as Obsidian would for a user edit.
    vault._handler!(makeFile("note.md"));
    // Let the (synchronous fake) debounce + async process settle.
    await vi.runAllTimersAsync();

    // Exactly one write: the link pass. The modify event from our own write
    // must be ignored (no second write).
    expect(vault.modify).toHaveBeenCalledTimes(1);
    expect(vault.modify.mock.calls[0][1]).toBe("note about [[Foo]]");
  });

  it("does not write when content is already fully linked", async () => {
    const { deps, vault } = makeDeps("note about [[Foo]]", true);
    const trigger = new OnSaveTrigger(deps);
    trigger.enable();

    vault._handler!(makeFile("note.md"));
    await vi.runAllTimersAsync();

    expect(vault.modify).not.toHaveBeenCalled();
  });

  it("does nothing once disabled", async () => {
    const { deps, vault } = makeDeps("note about Foo", true);
    const trigger = new OnSaveTrigger(deps);
    trigger.enable();
    trigger.dispose();
    expect(vault.offref).toHaveBeenCalled();
  });
});
