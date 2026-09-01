import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeenBy } from "./SeenBy";

describe("SeenBy", () => {
  it("オリジナルアイコンと人数、閲覧者名を表示する", () => {
    const html = renderToStaticMarkup(createElement(SeenBy, { users: [
      { id: "user-1", displayName: "父", avatarUrl: "https://example.com/father.jpg" },
      { id: "user-2", displayName: "母", avatarUrl: null },
    ] }));

    expect(html).toContain('data-icon="seen"');
    expect(html).not.toContain("👀");
    expect(html).toContain("みたよ 2人、一覧を表示");
    expect(html).toContain("父");
    expect(html).toContain("母");
    expect(html).toContain('src="https://example.com/father.jpg"');
    expect(html).toContain('class="seen-user-avatar"');
  });

  it("閲覧者がいない場合は表示しない", () => {
    expect(renderToStaticMarkup(createElement(SeenBy, { users: [] }))).toBe("");
  });
});
