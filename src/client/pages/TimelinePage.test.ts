import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Post } from "../../shared/types";
import { appendUniquePosts, formatTimelineMonth, UnreadSummary } from "./TimelinePage";

describe("timeline pagination", () => {
  it("追加取得で重複した投稿を除外する", () => {
    const first = { id: "first" } as Post;
    const second = { id: "second" } as Post;

    expect(appendUniquePosts([first], [first, second])).toEqual([first, second]);
  });
});

describe("timeline month heading", () => {
  it("日本時間の年月を表示する", () => {
    expect(formatTimelineMonth("2026-08-31T15:30:00.000Z")).toBe("2026年9月");
  });

  it("日付がない投稿を区別する", () => {
    expect(formatTimelineMonth(null)).toBe("日付なし");
  });
});

describe("unread summary", () => {
  it("未閲覧件数と閲覧開始導線を表示する", () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(UnreadSummary, { count: 3 })));

    expect(html).toContain("3件");
    expect(html).toContain("新しい思い出があります");
    expect(html).toContain('href="/unread"');
  });
});
