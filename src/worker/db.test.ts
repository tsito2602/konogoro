import { describe, expect, it } from "vitest";
import type { User } from "../shared/types";
import { countUnreadPosts, loadNextUnreadPost, loadPosts, type PostRow } from "./db";

const currentUser: User = {
  id: "user-1",
  displayName: "翼",
  role: "owner",
  avatarUrl: null,
};

const post: PostRow = {
  id: "post-1",
  caption: "海",
  event_id: null,
  event_title: null,
  event_start_date: null,
  event_end_date: null,
  scene_id: null,
  scene_title: null,
  captured_at: "2026-09-02T00:00:00.000Z",
  published_at: "2026-09-02T00:00:00.000Z",
  author_name: "翼",
  author_avatar_url: null,
};

describe("loadPosts", () => {
  it("動画本体を画像プレビュー用キャッシュとは異なるURLで配信する", async () => {
    const media = [
      {
        id: "image-1",
        post_id: post.id,
        kind: "image",
        mime_type: "image/jpeg",
        original_filename: "photo.jpg",
        byte_size: 100,
        width: 100,
        height: 100,
        duration_seconds: null,
        captured_at: post.captured_at,
        position: 0,
      },
      {
        id: "video-1",
        post_id: post.id,
        kind: "video",
        mime_type: "video/quicktime",
        original_filename: "movie.mov",
        byte_size: 200,
        width: 100,
        height: 100,
        duration_seconds: 3,
        captured_at: post.captured_at,
        position: 1,
      },
    ];
    const db = {
      prepare: (query: string) => ({
        bind: () => ({
          all: async () => ({ results: query.includes("FROM media") ? media : [] }),
        }),
      }),
    } as unknown as D1Database;

    const [result] = await loadPosts(db, [post], currentUser);

    expect(result.media[0].contentUrl).toBe("/api/media/image-1/content?variant=preview");
    expect(result.media[1].contentUrl).toBe("/api/media/video-1/content?variant=video-v2");
  });
});

describe("unread posts", () => {
  it("現在のユーザーが未閲覧の投稿数を数える", async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => {
          statements.push({ sql, values });
          return { first: async () => ({ count: 4 }) };
        },
      }),
    } as unknown as D1Database;

    expect(await countUnreadPosts(db, currentUser.id)).toBe(4);
    expect(statements[0].sql).toContain("NOT EXISTS");
    expect(statements[0].values).toEqual([currentUser.id]);
  });

  it("公開日時が古い未閲覧投稿を1件だけ取得する", async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => {
          statements.push({ sql, values });
          return {
            first: async () => ({ count: 2 }),
            all: async () => {
              if (sql.includes("LIMIT 1")) return { results: [post] };
              return { results: [] };
            },
          };
        },
      }),
    } as unknown as D1Database;

    const result = await loadNextUnreadPost(db, currentUser);

    expect(result.unreadCount).toBe(2);
    expect(result.posts.map(({ id }) => id)).toEqual([post.id]);
    const unreadQuery = statements.find(({ sql }) => sql.includes("LIMIT 1"));
    expect(unreadQuery?.sql).toContain("NOT EXISTS");
    expect(unreadQuery?.sql).toContain("ORDER BY COALESCE(p.published_at, p.created_at), p.id");
    expect(unreadQuery?.values).toEqual([currentUser.id]);
  });
});
