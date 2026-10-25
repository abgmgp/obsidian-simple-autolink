import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TFile } from "obsidian";
import { OnFocusTrigger, OnFocusDeps } from "../src/triggers/on-focus";
import { buildMatchIndex, IndexEntry } from "../src/core/matcher";
import { normalize } from "../src/core/normalizer";
import { DEFAULT_SETTINGS } from "../src/settings/settings";
import { Logger } from "../src/util/logger";

function makeFile(path: string): TFile {
  const f = new TFile();
  f.path = path;
  f.extension = "md";
  return f;
}

function indexOf() {
  const entries: IndexEntry[] = [["Foo", "Foo", "foo.md"]].map(([term, canonical, path]) => ({
    key: normalize(term, DEFAULT_SETTINGS.normalize),
    term,
    target: { canonical, path },
  }));
  return buildMatchIndex(entries);
}

interface FakeWorkspace {
  on: ReturnType<typeof vi.fn>;
  offref: ReturnType<typeof vi.fn>;
  _handler?: (file: TFile | null) => void;
}

interface FakeVault {
  modify: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
}

function makeDeps(content: string, onFocus = true) {
  const store = new Map<string, string>();
  const vault: FakeVault = {
    modify: vi.fn(async (f: TFile, data: string) => {
      store.set(f.path, data);
    }),
    read: vi.fn(async (f: TFile) => store.get(f.path) ?? content),
  };
  const workspace: FakeWorkspace = {
    on: vi.fn((_name: string, handler: (file: TFile | null) => void) => {
      workspace._handler = handler;
      return { name: "file-open" };
    }),
    offref: vi.fn(),
  };
  const deps: OnFocusDeps = {
    app: { vault, workspace } as never,
    log: new Logger("silent"),
    getSettings: () => ({ ...DEFAULT_SETTINGS, onFocus, oneLinkPerFile: false }),
    getIndex: () => indexOf(),
    inScope: () => true,
  };
  return { deps, vault, workspace };
}

describe("OnFocusTrigger", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("links when a file is opened", async () => {
    const { deps, vault, workspace } = makeDeps("note about Foo", true);
    const trigger = new OnFocusTrigger(deps);
    trigger.enable();

    workspace._handler!(makeFile("note.md"));
    await vi.runAllTimersAsync();

    expect(vault.modify).toHaveBeenCalledTimes(1);
    expect(vault.modify.mock.calls[0][1]).toBe("note about [[Foo]]");
  });

  it("does nothing when disabled", async () => {
    const { deps, vault, workspace } = makeDeps("note about Foo", false);
    const trigger = new OnFocusTrigger(deps);
    trigger.enable();

    workspace._handler!(makeFile("note.md"));
    await vi.runAllTimersAsync();

    expect(vault.modify).not.toHaveBeenCalled();
  });

  it("disposes cleanly", () => {
    const { deps, workspace } = makeDeps("note about Foo", true);
    const trigger = new OnFocusTrigger(deps);
    trigger.enable();
    trigger.dispose();
    expect(workspace.offref).toHaveBeenCalled();
  });
});
