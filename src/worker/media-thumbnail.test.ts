import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app as apiApp } from "./index";
import { mediaThumbnailRoutes } from "./media-thumbnail";
import type { User } from "../shared/types";
import { thumbnailUrl } from "../shared/media-thumbnail";

const owner = "01JDEVUSER0000000000000000";
const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
const png = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=", "base64"),
);

function fixture(role: User["role"] = "owner") {
  const sql = new DatabaseSync(":memory:");
  databases.push(sql);
  for (const migration of readdirSync("migrations").sort()) sql.exec(readFileSync(`migrations/${migration}`, "utf8"));
  sql
    .prepare(
      "INSERT INTO posts (id,created_by,created_at,updated_at,status,caption) VALUES ('post',?,'now','now','published','unchanged')",
    )
    .run(owner);
  sql
    .prepare(
      `INSERT INTO media (id,post_id,kind,original_filename,mime_type,original_object_key,thumbnail_object_key,
    byte_size,position,created_by,created_at,status) VALUES ('video','post','video','travel.mp4','video/mp4',
    'original','old-thumbnail',12,0,?,'now','uploaded')`,
    )
    .run(owner);
  const db = {
    prepare: (query: string) => ({
      all: async () => ({ results: sql.prepare(query).all() }),
      bind: (...values: (string | number | null)[]) => ({
        first: async () => sql.prepare(query).get(...values) ?? null,
        all: async () => ({ results: sql.prepare(query).all(...values) }),
        run: async () => ({ meta: sql.prepare(query).run(...values) }),
      }),
    }),
  } as unknown as D1Database;
  const metadata = {
    size: 12,
    etag: "etag",
    httpEtag: '"etag"',
    uploaded: new Date(),
    writeHttpMetadata: () => undefined,
  };
  const get = vi.fn(async (_key: string, options?: R2GetOptions) => {
    const range = options?.range as { offset: number; length: number } | undefined;
    return {
      ...metadata,
      body: new Response(range ? "abcdefghijkl".slice(range.offset, range.offset + range.length) : "abcdefghijkl").body,
    };
  });
  const put = vi.fn(async () => undefined);
  const remove = vi.fn(async () => undefined);
  const env = {
    APP_ORIGIN: "http://localhost:5173",
    DB: db,
    MEDIA: { get, head: vi.fn(async () => metadata), put, delete: remove },
  } as unknown as Cloudflare.Env;
  const app = new Hono<{ Bindings: typeof env; Variables: { currentUser: User } }>();
  app.use("*", async (c, next) => {
    c.set("currentUser", { id: owner, role, displayName: "Owner" });
    await next();
  });
  app.route("/", mediaThumbnailRoutes);
  const update = (body: Uint8Array = png, type = "image/png") =>
    app.request(
      "/media/video/thumbnail/image",
      {
        method: "PUT",
        headers: { "Content-Type": type },
        body: new Blob([body as Uint8Array<ArrayBuffer>]),
      },
      env,
    );
  const source = (range?: string) =>
    app.request("/media/video/thumbnail/source", { headers: range ? { Range: range } : {} }, env);
  const row = () => sql.prepare("SELECT * FROM media WHERE id='video'").get()!;
  return { sql, update, source, row, put, get, remove, env };
}

describe("動画のサムネイル再生成", () => {
  it.each(["owner", "uploader"] as const)("%sは画像のみ更新し、再生成のたびにURLを変える", async (role) => {
    const f = fixture(role);
    const before = f.row();
    const first = await f.update();
    expect(first.status).toBe(200);
    const url = ((await first.json()) as { thumbnailUrl: string }).thumbnailUrl;
    const key = String(f.row().thumbnail_object_key);
    expect(url).toBe(thumbnailUrl("video", key));
    expect(url).toContain("&v=");
    expect(f.row()).toEqual({ ...before, thumbnail_object_key: key });
    expect(f.sql.prepare("SELECT caption FROM posts WHERE id='post'").get()?.caption).toBe("unchanged");
    expect(f.put).toHaveBeenCalledWith(key, expect.any(ArrayBuffer), { httpMetadata: { contentType: "image/png" } });
    const next = await f.update();
    expect(((await next.json()) as { thumbnailUrl: string }).thumbnailUrl).not.toBe(url);
    expect(f.remove).not.toHaveBeenCalled();
  });
  it("再生成後はすべての閲覧APIが新しい画像URLを返す", async () => {
    const f = fixture();
    f.sql
      .prepare(
        "INSERT INTO events (id,title,created_by,created_at,updated_at,cover_media_id) VALUES ('event','Test',?,'now','now','video')",
      )
      .run(owner);
    f.sql.exec("UPDATE posts SET event_id='event', published_at='2026-09-20T00:00:00Z'");
    const result = await f.update();
    const url = ((await result.json()) as { thumbnailUrl: string }).thumbnailUrl;
    for (const path of [
      "/posts/post",
      "/timeline",
      "/album",
      "/activity",
      "/events",
      "/events/event",
      "/events/event/cover-media",
    ]) {
      const response = await apiApp.request(`/api${path}`, undefined, f.env);
      expect(response.status, path).toBe(200);
      expect(await response.text(), path).toContain(url);
    }
    const image = await apiApp.request(url, undefined, f.env);
    expect(image.headers.get("Content-Type")).toBe("image/png");
    // Removing the authenticated member prevents both endpoints from touching R2.
    f.sql.exec("UPDATE users SET is_active=0");
    f.get.mockClear();
    f.put.mockClear();
    expect((await apiApp.request("/api/media/video/thumbnail/source", undefined, f.env)).status).toBe(401);
    expect((await apiApp.request("/api/media/video/thumbnail/image", { method: "PUT", body: png }, f.env)).status).toBe(
      401,
    );
    expect(f.get).not.toHaveBeenCalled();
    expect(f.put).not.toHaveBeenCalled();
  });
  it("viewerは読み取りも書き込みも拒否する", async () => {
    const f = fixture("viewer");
    expect((await f.update()).status).toBe(403);
    expect((await f.source()).status).toBe(403);
    expect(f.put).not.toHaveBeenCalled();
    expect(f.get).not.toHaveBeenCalled();
  });
  it.each([
    "UPDATE posts SET status='draft'",
    "DELETE FROM posts",
    "UPDATE media SET kind='image'",
    "UPDATE media SET status='pending'",
    "DELETE FROM media",
  ])("対象外のデータを拒否: %s", async (query) => {
    const f = fixture();
    f.sql.exec(query);
    expect((await f.update()).status).toBe(404);
    expect((await f.source()).status).toBe(404);
    expect(f.put).not.toHaveBeenCalled();
  });
  it("PNG以外、不正な画像、サイズ超過では元画像を保持する", async () => {
    const f = fixture();
    expect((await f.update(png, "image/jpeg")).status).toBe(400);
    expect((await f.update(new Uint8Array(40))).status).toBe(400);
    const oversized = png.slice();
    new DataView(oversized.buffer).setUint32(16, 481);
    expect((await f.update(oversized)).status).toBe(400);
    expect((await f.update(new Uint8Array(2 * 1024 * 1024 + 1))).status).toBe(413);
    expect(f.row().thumbnail_object_key).toBe("old-thumbnail");
    expect(f.put).not.toHaveBeenCalled();
  });
  it("画像送信失敗時に参照を書き換えない", async () => {
    const f = fixture();
    f.put.mockRejectedValueOnce(new Error("R2 unavailable"));
    expect((await f.update()).status).toBe(500);
    expect(f.row().thumbnail_object_key).toBe("old-thumbnail");
  });
  it("同時更新に負けた画像は採用しない", async () => {
    const f = fixture();
    f.put.mockImplementationOnce(async () => {
      f.sql.exec("UPDATE media SET thumbnail_object_key='other'");
    });
    expect((await f.update()).status).toBe(409);
    expect(f.row().thumbnail_object_key).toBe("other");
    expect(f.remove).toHaveBeenCalledTimes(1);
    expect(f.remove).not.toHaveBeenCalledWith("other");
  });
  it("ソースは同一オリジンで必要な範囲だけ返す", async () => {
    const f = fixture();
    const response = await f.source("bytes=2-4");
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("cde");
    expect(response.headers.has("Location")).toBe(false);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(f.get).toHaveBeenCalledWith("original", {
      onlyIf: { etagMatches: "etag" },
      range: { offset: 2, length: 3 },
    });
  });
  it("再生用動画はready時だけ使う", async () => {
    const f = fixture();
    f.sql.exec("UPDATE media SET playback_object_key='playback', playback_status='pending'");
    await f.source();
    expect(f.get).toHaveBeenLastCalledWith("original");
    f.sql.exec("UPDATE media SET playback_status='ready'");
    await f.source();
    expect(f.get).toHaveBeenLastCalledWith("playback");
  });
});
