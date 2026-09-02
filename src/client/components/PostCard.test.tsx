import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Post } from "../../shared/types";
import { PostCard } from "./PostCard";

const post = {
  id: "post-1",
  caption: "旅行の思い出",
  eventId: null,
  eventTitle: null,
  sectionId: null,
  sectionTitle: null,
  capturedAt: "2026-09-01T00:00:00.000Z",
  publishedAt: "2026-09-01T00:00:00.000Z",
  authorName: "翼",
  authorAvatarUrl: null,
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
    expect(html).toContain('aria-label="未閲覧の投稿を開く"');
  });

  it("閲覧済みの投稿には未閲覧表示を付けない", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PostCard post={{ ...post, viewedByCurrentUser: true }} /></MemoryRouter>);
    expect(html).toContain('class="media-grid"');
    expect(html).not.toContain('class="media-grid unseen"');
  });

  it("投稿者アイコンとイベント情報を写真の上に表示する", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PostCard post={{ ...post, eventId: "event-1", eventTitle: "箱根旅行", sectionTitle: "2日目" }} /></MemoryRouter>);
    expect(html).toContain('aria-label="翼さんの投稿を開く"');
    expect(html).toContain("箱根旅行");
    expect(html).toContain("2日目");
    expect(html).toContain('class="post-author-avatar"');
  });

  it("イベントがない投稿は日常の投稿として表示する", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PostCard post={post} /></MemoryRouter>);
    expect(html).toContain("日常の投稿");
    expect(html).toContain("旅行の思い出");
  });

  it("コメント総数と最新コメント1件を表示する", () => {
    const comments = [
      { id: "comment-1", body: "最初のコメント", userId: "user-1", authorName: "薫", avatarUrl: null, createdAt: "2026-09-01T00:00:00.000Z", canDelete: false },
      { id: "comment-2", body: "最新のコメント", userId: "user-2", authorName: "翼", avatarUrl: null, createdAt: "2026-09-02T00:00:00.000Z", canDelete: false },
    ];
    const html = renderToStaticMarkup(<MemoryRouter><PostCard post={{ ...post, comments }} /></MemoryRouter>);
    expect(html).toContain("最新のコメント");
    expect(html).not.toContain("最初のコメント");
    expect(html).toContain('aria-label="コメント2件を開く"');
    expect(html).toContain("ほかのコメントを見る");
    expect(html).not.toContain("ほかのコメント1件を見る");
  });

  it("コメントが1件のときはほかのコメントへの導線を表示しない", () => {
    const comments = [{ id: "comment-1", body: "似合ってる！", userId: "user-1", authorName: "薫", avatarUrl: null, createdAt: "2026-09-01T00:00:00.000Z", canDelete: false }];
    const html = renderToStaticMarkup(<MemoryRouter><PostCard post={{ ...post, comments }} /></MemoryRouter>);
    expect(html).toContain('aria-label="コメント1件を開く"');
    expect(html).not.toContain("ほかのコメントを見る");
  });

  it("コメントがないときもコメント数0を表示する", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PostCard post={post} /></MemoryRouter>);
    expect(html).toContain('aria-label="コメント0件を開く"');
    expect(html).toContain('aria-label="みたよ 0人"');
  });

  it("撮影日はカメラアイコン付きで表示する", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PostCard post={post} /></MemoryRouter>);
    expect(html).toContain('aria-label="撮影日 9月1日"');
    expect(html).toContain("lucide-camera");
  });

  it("撮影日がない場合は投稿日をアップロードアイコン付きで表示する", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PostCard post={{ ...post, capturedAt: null }} /></MemoryRouter>);
    expect(html).toContain('aria-label="投稿日 9月1日"');
    expect(html).toContain("lucide-upload");
  });
});
