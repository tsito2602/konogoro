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
  sceneId: null,
  sceneTitle: null,
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
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PostCard post={post} />
      </MemoryRouter>,
    );
    expect(html).toContain('class="media-grid unseen"');
  });

  it("閲覧済みの投稿には未閲覧表示を付けない", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PostCard post={{ ...post, viewedByCurrentUser: true }} />
      </MemoryRouter>,
    );
    expect(html).toContain('class="media-grid"');
    expect(html).not.toContain('class="media-grid unseen"');
  });

  it("画像ごとにMedia Viewerへ直接移動する", () => {
    const media = [
      {
        id: "media-1",
        kind: "image" as const,
        mimeType: "image/jpeg",
        originalFilename: "photo.jpg",
        byteSize: 100,
        width: 100,
        height: 100,
        durationSeconds: null,
        capturedAt: post.capturedAt,
        position: 0,
        contentUrl: "/api/media/media-1/content?variant=preview",
        thumbnailUrl: "/api/media/media-1/content?variant=thumbnail",
        downloadUrl: "/api/media/media-1/download",
      },
    ];
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PostCard post={{ ...post, media }} />
      </MemoryRouter>,
    );
    expect(html).toContain('href="/posts/post-1/media/media-1"');
    expect(html).toContain('aria-label="未閲覧の投稿の写真 1/1を開く"');
  });

  it("投稿者名とイベント・シーンを写真の上、撮影日を写真の下に表示する", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PostCard post={{ ...post, eventId: "event-1", eventTitle: "箱根旅行", sceneTitle: "2日目" }} />
      </MemoryRouter>,
    );
    expect(html).toContain('aria-label="翼さんの投稿を開く"');
    expect(html).toContain('class="post-author-name">翼</strong>');
    expect(html).toContain('class="post-date"');
    expect(html).toContain("箱根旅行");
    expect(html).toContain("2日目");
    expect(html).toContain('class="post-author-avatar"');
    expect(html).toContain("lucide-calendar-days");
    expect(html).not.toContain("lucide-folder");
  });

  it("イベントがない投稿はコンテキスト行を表示しない", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PostCard post={post} />
      </MemoryRouter>,
    );
    expect(html).not.toContain('class="post-context"');
    expect(html).toContain("旅行の思い出");
  });

  it("イベント詳細では投稿者名とシーン名だけをコンテキストに表示する", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PostCard
          showContext={false}
          post={{ ...post, eventId: "event-1", eventTitle: "箱根旅行", sceneId: "scene-1", sceneTitle: "2日目" }}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("2日目");
    expect(html).not.toContain("箱根旅行");
    expect(html).not.toContain("lucide-calendar-days");
  });

  it("コメント総数と最新コメント1件を表示する", () => {
    const comments = [
      {
        id: "comment-1",
        body: "最初のコメント",
        userId: "user-1",
        authorName: "薫",
        avatarUrl: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        canDelete: false,
      },
      {
        id: "comment-2",
        body: "最新のコメント",
        userId: "user-2",
        authorName: "翼",
        avatarUrl: null,
        createdAt: "2026-09-02T00:00:00.000Z",
        canDelete: false,
      },
    ];
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PostCard post={{ ...post, comments }} />
      </MemoryRouter>,
    );
    expect(html).toContain("最新のコメント");
    expect(html).not.toContain("最初のコメント");
    expect(html).toContain('aria-label="コメント2件を開く"');
    expect(html).toContain(">コメント2件</span>");
    expect(html).toContain("ほかのコメントを見る");
    expect(html).not.toContain("ほかのコメント1件を見る");
  });

  it("コメントが1件のときはほかのコメントへの導線を表示しない", () => {
    const comments = [
      {
        id: "comment-1",
        body: "似合ってる！",
        userId: "user-1",
        authorName: "薫",
        avatarUrl: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        canDelete: false,
      },
    ];
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PostCard post={{ ...post, comments }} />
      </MemoryRouter>,
    );
    expect(html).toContain('aria-label="コメント1件を開く"');
    expect(html).toContain(">コメント1件</span>");
    expect(html).not.toContain("ほかのコメントを見る");
  });

  it("コメントがないときはコメントを書く導線を表示する", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PostCard post={post} />
      </MemoryRouter>,
    );
    expect(html).toContain('aria-label="コメントを書く"');
    expect(html).toContain(">コメントを書く</span>");
    expect(html).toContain('aria-label="見た人 0人"');
  });

  it("撮影日はカメラアイコン付きで表示する", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PostCard post={post} />
      </MemoryRouter>,
    );
    expect(html).toContain('aria-label="撮影日 9月1日"');
    expect(html).toContain("lucide-camera");
  });

  it("撮影日がない場合は投稿日をアップロードアイコン付きで表示する", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PostCard post={{ ...post, capturedAt: null }} />
      </MemoryRouter>,
    );
    expect(html).toContain('aria-label="投稿日 9月1日"');
    expect(html).toContain("lucide-upload");
  });
});
