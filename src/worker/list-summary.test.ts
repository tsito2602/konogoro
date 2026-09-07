/// <reference types="node" />
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { loadPosts, postSelect, type PostRow } from "./db";
import { app } from "./index";
import type { Post, User } from "../shared/types";

const user: User = { id: "01JDEVUSER0000000000000000", displayName: "Fixture", role: "owner" };
function fixture() {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations").sort()) sql.exec(readFileSync(`migrations/${file}`, "utf8"));
  const db = {
    prepare: (query: string) => ({
      bind: (...values: (string | number | null)[]) => ({
        first: async () => sql.prepare(query).get(...values) ?? null,
        all: async () => ({ results: sql.prepare(query).all(...values) }),
        run: async () => ({ meta: sql.prepare(query).run(...values) }),
      }),
    }),
  } as unknown as D1Database;
  const post = sql.prepare(
    "INSERT INTO posts (id, caption, status, created_by, published_at, created_at, updated_at) VALUES (?, '', ?, ?, '2026-09-06', '2026-09-06', '2026-09-06')",
  );
  post.run("post", "published", user.id);
  post.run("empty", "published", user.id);
  post.run("draft", "draft", user.id);
  const media = sql.prepare(
    "INSERT INTO media (id, post_id, kind, status, original_filename, mime_type, original_object_key, position, created_by, created_at) VALUES (?, 'post', ?, ?, 'sample', ?, ?, ?, ?, '2026-09-06')",
  );
  for (let i = 0; i < 30; i++)
    media.run(
      `m-${i}`,
      i === 20 ? "video" : "image",
      "uploaded",
      i === 20 ? "video/mp4" : "image/jpeg",
      `original-${i}`,
      i,
      user.id,
    );
  media.run("pending", "video", "pending", "video/mp4", "pending-original", 30, user.id);
  const comment = sql.prepare(
    "INSERT INTO comments (id, post_id, user_id, body, created_at, updated_at) VALUES (?, 'post', ?, ?, '2026-09-06', '2026-09-06')",
  );
  for (let i = 0; i < 80; i++)
    comment.run(`c-${String(i).padStart(3, "0")}`, user.id, `Fixture ${i} ` + "x".repeat(200));
  sql.prepare("INSERT INTO view_histories VALUES ('v', 'post', ?, '2026-09-06', '2026-09-06')").run(user.id);
  const rows = sql.prepare(postSelect + " WHERE p.id IN ('post', 'empty') ORDER BY p.id").all() as PostRow[];
  return { sql, db, rows, env: { DB: db, APP_ORIGIN: "http://localhost:5173" } as unknown as Cloudflare.Env };
}

describe("一覧と詳細の取得契約", () => {
  it("種類を優先せず登録順の先頭4件を返し、全件数と既読を維持する", async () => {
    const { sql, db, rows } = fixture();
    try {
      const posts = await loadPosts(db, rows, user, "summary");
      const summary = posts.find((p) => p.id === "post")!;
      expect(summary.media.map((m) => m.id)).toEqual(["m-0", "m-1", "m-2", "m-3"]);
      expect([summary.mediaCount, summary.photoCount, summary.videoCount]).toEqual([30, 29, 1]);
      expect(summary.commentCount).toBe(80);
      expect(summary.comments.map((c) => c.id)).toEqual(["c-079"]);
      expect(summary.viewedByCurrentUser).toBe(true);
      const empty = posts.find((p) => p.id === "empty")!;
      expect([empty.mediaCount, empty.commentCount, empty.viewedByCurrentUser]).toEqual([0, 0, false]);
      const detail = (await loadPosts(db, rows, user)).find((p) => p.id === "post")!;
      expect(detail.media).toHaveLength(30);
      expect(detail.comments).toHaveLength(80);
      expect(detail.media.map((m) => m.position)).toEqual(Array.from({ length: 30 }, (_, i) => i));
      console.info("Synthetic API bytes", {
        summary: Buffer.byteLength(JSON.stringify(summary)),
        detail: Buffer.byteLength(JSON.stringify(detail)),
      });
      expect(Buffer.byteLength(JSON.stringify(summary))).toBeLessThan(Buffer.byteLength(JSON.stringify(detail)) / 3);
      sql.prepare("DELETE FROM comments WHERE id = 'c-079'").run();
      const refreshed = (await loadPosts(db, rows, user, "summary")).find((p) => p.id === "post")!;
      expect(refreshed.commentCount).toBe(79);
      expect(refreshed.comments[0].id).toBe("c-078");
    } finally {
      sql.close();
    }
  });
  it("実際の一覧は軽量・詳細は全件となり、非認証へ内容を返さない", async () => {
    const { sql, env } = fixture();
    try {
      const response = await app.request("/api/timeline", undefined, env);
      expect(response.status).toBe(200);
      expect(response.headers.get("Server-Timing")).toMatch(/^app;dur=\d+\.\d$/);
      const body = await response.json<{ posts: Post[] }>();
      expect(body.posts.map((p) => p.id)).not.toContain("draft");
      expect(body.posts.find((p) => p.id === "post")?.comments).toHaveLength(1);
      const detail = await app.request("/api/posts/post", undefined, env);
      expect((await detail.json<Post>()).comments).toHaveLength(80);
      const unauthorized = await app.request("/api/timeline", undefined, {
        ...env,
        APP_ORIGIN: "https://example.test",
        LINE_CHANNEL_ID: "configured",
        LINE_CHANNEL_SECRET: "configured",
      });
      expect(unauthorized.status).toBe(401);
    } finally {
      sql.close();
    }
  });
});
