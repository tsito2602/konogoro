import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./accessibility.css", import.meta.url), "utf8");

describe("viewer accessibility safeguards", () => {
  it("keeps keyboard focus visible", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("outline: 3px solid var(--focus-ring)");
  });

  it("keeps primary interactive targets at least 44px tall", () => {
    expect(css).toContain("min-height: 44px");
    expect(css).toContain('[role="button"]');
    expect(css).toContain(".tab-item");
  });

  it("allows narrow layouts to wrap long page titles", () => {
    expect(css).toContain("@media (max-width: 420px)");
    expect(css).toContain("white-space: normal");
  });

  it("respects reduced-motion preferences", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 0.01ms");
  });
});
