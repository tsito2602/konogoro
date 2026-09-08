import { afterEach, describe, expect, it, vi } from "vitest";
import { bootMotionElapsed, bootMotionRemaining } from "./boot-motion";

describe("boot motion gate", () => {
  it("waits only for the remaining part of the initial animation", () => {
    expect(bootMotionRemaining(0, true, false)).toBe(900);
    expect(bootMotionRemaining(350, true, false)).toBe(550);
  });
  it("does not replay after slow loading or resume", () => {
    expect(bootMotionRemaining(900, true, false)).toBe(0);
    expect(bootMotionRemaining(5000, true, false)).toBe(0);
  });
  it("does not delay reduced motion or a browser without the boot icon", () => {
    expect(bootMotionRemaining(0, true, true)).toBe(0);
    expect(bootMotionRemaining(0, false, false)).toBe(0);
  });
});

describe("initial boot animation clock", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("uses actual animation progress instead of document load time", () => {
    vi.stubGlobal("document", { querySelector: () => ({ getAnimations: () => [{ currentTime: 240 }] }) });
    expect(bootMotionRemaining(bootMotionElapsed(), true, false)).toBe(660);
  });
  it("waits for the full motion when first paint has not started", () => {
    vi.stubGlobal("document", { querySelector: () => ({ getAnimations: () => [{ currentTime: null }] }) });
    expect(bootMotionRemaining(bootMotionElapsed(), true, false)).toBe(900);
  });
});
