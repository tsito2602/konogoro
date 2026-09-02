import { describe, expect, it } from "vitest";
import type { User } from "../shared/types";
import { loadPosts, type PostRow } from "./db";

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
    expect(result.media[1].contentUrl).toBe("/api/media/video-1/content?variant=video");
  });
});
