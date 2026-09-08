import { describe, expect, it } from "vitest";
import { bootMotionRemaining } from "./boot-motion";

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
