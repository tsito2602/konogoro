import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Post } from "../../shared/types";
import {
  appendUniquePosts,
  formatTimelineMonth,
  timelineDate,
  UnreadSummary,
  groupTimelinePosts,
  unreadPreview,
} from "./TimelinePage";

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

  it("イベント開始日を撮影日や投稿日より優先する", () => {
    expect(
      timelineDate({
        eventStartDate: "2026-04-10",
        eventEndDate: "2026-04-12",
        capturedAt: "2026-09-02T00:00:00.000Z",
        publishedAt: "2026-09-03T00:00:00.000Z",
      } as Post),
    ).toBe("2026-04-10");
  });

  it("開始日のないイベントでは終了日を使う", () => {
    expect(timelineDate({ eventStartDate: null, eventEndDate: "2026-04-12", capturedAt: null } as Post)).toBe(
      "2026-04-12",
    );
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

it("年月のまとまりは既存の投稿順を変えない", () => {
  const posts = ["2026-09-03", "2026-09-01", "2026-08-01", "2026-09-01"].map(
    (eventStartDate, index) => ({ id: String(index), eventStartDate }) as Post,
  );
  const groups = groupTimelinePosts(posts);
  expect(groups.map((group) => group.posts.map((post) => post.id))).toEqual([["0", "1"], ["2"], ["3"]]);
  expect(groups.flatMap((group) => group.posts)).toEqual(posts);
});

it("新着の代表写真に既読投稿を使わず、未取得なら記号へ戻す", () => {
  const viewed = { viewedByCurrentUser: true, media: [{ thumbnailUrl: "/read.jpg" }] } as Post;
  const empty = { viewedByCurrentUser: false, media: [] } as unknown as Post;
  const unread = { viewedByCurrentUser: false, media: [{ thumbnailUrl: "/unread.jpg" }] } as Post;
  expect(unreadPreview([viewed, empty, unread])).toBe("/unread.jpg");
  expect(unreadPreview([viewed, empty])).toBeUndefined();
});
