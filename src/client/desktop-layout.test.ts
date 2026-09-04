import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("desktop layout contract", () => {
  it("switches the application shell and shared header at desktop width", () => {
    expect(css).toContain("@media (min-width: 1024px)");
    expect(css).toContain(".app-shell:not(.viewer-shell)");
    expect(css).toContain(".page-header-inner");
    expect(css).toContain("max-width: 1280px");
  });

  it.each([
    ".timeline-layout",
    ".activity-page",
    ".event-list",
    ".album-page",
    ".event-detail",
    ".settings-page",
    ".family-page",
    ".event-edit",
    ".post-detail",
  ])("defines a desktop layout for %s", (selector) => {
    const desktopCss = css.slice(css.indexOf("@media (min-width: 1024px)"));
    expect(desktopCss).toContain(selector);
  });

  it("uses the wide screen for task-specific multi-column layouts", () => {
    const wideCss = css.slice(css.indexOf("@media (min-width: 1200px)"));
    expect(wideCss).toContain(".timeline-layout:has(.timeline-sidebar)");
    expect(wideCss).toContain(".activity-page:has(.member-last-viewed)");
    expect(wideCss).toContain(".album-month");
    expect(wideCss).toContain(".event-detail");
    expect(wideCss).toContain(".post-detail");
  });
});
