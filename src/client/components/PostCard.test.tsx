import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Post } from "../../shared/types";
import { PostCard } from "./PostCard";

const post = {
  id: "post-1",
  title: "旅行",
  caption: "",
  eventId: null,
  eventTitle: null,
  sectionId: null,
  sectionTitle: null,
  capturedAt: "2026-09-01T00:00:00.000Z",
  publishedAt: "2026-09-01T00:00:00.000Z",
  authorName: "翼",
  canEdit: false,
  canDelete: false,
  viewedByCurrentUser: false,
  media: [],
  comments: [],
  seenBy: [],
} satisfies Post;

describe("PostCard", () => {
  it("未閲覧の投稿へ未閲覧表示を付ける", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PostCard post={post} /></MemoryRouter>);
    expect(html).toContain('class="media-grid unseen"');
    expect(html).toContain('aria-label="未閲覧の旅行を開く"');
  });

  it("閲覧済みの投稿には未閲覧表示を付けない", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PostCard post={{ ...post, viewedByCurrentUser: true }} /></MemoryRouter>);
    expect(html).toContain('class="media-grid"');
    expect(html).not.toContain('class="media-grid unseen"');
  });

  it("イベントとセクションを一緒に表示して投稿詳細への矢印を付ける", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PostCard post={{ ...post, eventId: "event-1", eventTitle: "箱根旅行", sectionTitle: "2日目" }} /></MemoryRouter>);
    expect(html).toContain('href="/events/event-1"');
    expect(html).toContain("箱根旅行");
    expect(html).toContain("2日目");
    expect(html).toContain('aria-label="旅行の詳細を開く"');
  });

  it("最新コメント1件と残りのコメント数を表示する", () => {
    const comments = [
      { id: "comment-1", body: "最初のコメント", userId: "user-1", authorName: "薫", avatarUrl: null, createdAt: "2026-09-01T00:00:00.000Z", canDelete: false },
      { id: "comment-2", body: "最新のコメント", userId: "user-2", authorName: "翼", avatarUrl: null, createdAt: "2026-09-02T00:00:00.000Z", canDelete: false },
    ];
    const html = renderToStaticMarkup(<MemoryRouter><PostCard post={{ ...post, comments }} /></MemoryRouter>);
    expect(html).toContain("最新のコメント");
    expect(html).not.toContain("最初のコメント");
    expect(html).toContain("ほかのコメント1件を見る");
  });
});
