import { describe, it, expect, vi } from "vitest";
import { Logger } from "../src/util/logger";

describe("Logger", () => {
  it("respects level gating", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const log = new Logger("silent");
    log.info("hidden");
    expect(spy).not.toHaveBeenCalled();

    log.setLevel("info");
    log.info("shown");
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
