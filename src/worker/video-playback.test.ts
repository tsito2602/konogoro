import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { videoPlaybackRoutes } from "./video-playback";
import type { User } from "../shared/types";

const originalSha = "a".repeat(64);
const playbackSha = "b".repeat(64);
const owner = "01JDEVUSER0000000000000000";
const entry = {
  original: { filename: "travel.mp4", byteSize: 1000, sha256: originalSha },
  playback: {
    filename: "prepared.mp4",
    byteSize: 100,
    sha256: playbackSha,
    mimeType: "video/mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    width: 1920,
    height: 1080,
    durationSeconds: 10,
    faststart: true,
  },
};
const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));

function fixture(user: User = { id: owner, role: "owner", displayName: "所有者" }) {
  const sql = new DatabaseSync(":memory:");
  databases.push(sql);
  for (const migration of readdirSync("migrations").sort()) sql.exec(readFileSync(`migrations/${migration}`, "utf8"));
  sql.prepare("INSERT INTO posts (id,created_by,created_at,updated_at) VALUES ('post',?,'now','now')").run(owner);
  sql
    .prepare(
      `INSERT INTO media (id,post_id,kind,original_filename,mime_type,original_object_key,thumbnail_object_key,
    byte_size,original_sha256,position,created_by,created_at) VALUES ('video','post','video','travel.mp4','video/mp4',
    'original','thumbnail',1000,?,0,?,'now')`,
    )
    .run(originalSha, owner);
  const db = {
    prepare: (query: string) => ({
      bind: (...values: (string | number | null)[]) => ({
        first: async () => sql.prepare(query).get(...values) ?? null,
        run: async () => ({ meta: sql.prepare(query).run(...values) }),
      }),
    }),
  } as unknown as D1Database;
  const objects = new Map<string, { size: number; httpMetadata: { contentType: string } }>();
  const head = vi.fn(async (key: string) => objects.get(key) ?? null);
  const env = {
    DB: db,
    MEDIA: { head },
    R2_ACCOUNT_ID: "test",
    R2_ACCESS_KEY_ID: "test",
    R2_SECRET_ACCESS_KEY: "test",
    R2_BUCKET_NAME: "test",
  } as unknown as Cloudflare.Env & R2Secrets;
  const app = new Hono<{ Bindings: typeof env; Variables: { currentUser: User } }>();
  app.use("*", async (c, next) => {
    c.set("currentUser", user);
    await next();
  });
  app.route("/", videoPlaybackRoutes);
  const post = (path: string, body = entry) =>
    app.request(
      `/media/video/playback/${path}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      env,
    );
  const row = () => sql.prepare("SELECT playback_object_key,playback_status FROM media WHERE id='video'").get()!;
  return { sql, post, row, objects, head };
}

describe("任意の再生用動画の確定", () => {
  it("対応する元動画と再生用動画の両方が届くまでreadyにしない", async () => {
    const { post, row, objects } = fixture();
    expect((await post("upload-url")).status).toBe(200);
    expect(row().playback_status).toBe("pending");
    expect((await post("complete")).status).toBe(409);
    const key = String(row().playback_object_key);
    objects.set(key, { size: 100, httpMetadata: { contentType: "video/mp4" } });
    expect((await post("complete")).status).toBe(409);
    objects.set("original", { size: 1000, httpMetadata: { contentType: "video/mp4" } });
    objects.set(key, { size: 99, httpMetadata: { contentType: "video/mp4" } });
    expect((await post("complete")).status).toBe(409);
    objects.set(key, { size: 100, httpMetadata: { contentType: "image/webp" } });
    expect((await post("complete")).status).toBe(409);
    objects.set(key, { size: 100, httpMetadata: { contentType: "video/mp4" } });
    expect((await post("complete")).status).toBe(200);
    expect(row().playback_status).toBe("ready");
    // Response-loss retry does not issue a new writable URL to a ready object.
    expect(await (await post("upload-url")).json()).toEqual({ ready: true });
    expect(await (await post("complete")).json()).toEqual({ ready: true });
  });

  it.each(["upload-url", "complete"])("%s: 閲覧者と別の投稿者を拒否する", async (path) => {
    const viewer = fixture({ id: owner, role: "viewer", displayName: "閲覧者" });
    expect((await viewer.post(path)).status).toBe(403);
    expect(viewer.head).not.toHaveBeenCalled();
    const other = fixture({ id: "other", role: "uploader", displayName: "別の投稿者" });
    expect((await other.post(path)).status).toBe(404);
    expect(other.head).not.toHaveBeenCalled();
  });

  it("同じ名前・容量でも元動画のSHAが違う場合や開始後の別ファイルへの変更を拒否する", async () => {
    const { post, row, sql } = fixture();
    expect(
      (await post("upload-url", { ...entry, original: { ...entry.original, sha256: "c".repeat(64) } })).status,
    ).toBe(409);
    expect(row().playback_object_key).toBeNull();
    expect((await post("upload-url")).status).toBe(200);
    const previous = row().playback_object_key;
    expect(
      (await post("upload-url", { ...entry, playback: { ...entry.playback, sha256: "c".repeat(64) } })).status,
    ).toBe(409);
    expect(row().playback_object_key).toBe(previous);
    sql.prepare("UPDATE media SET original_sha256 = NULL").run();
    expect((await post("upload-url")).status).toBe(409);
  });
});
