/// <reference types="node" />
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { ZodError } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { multipartRoutes } from "./multipart";
import { MULTIPART_PART_SIZE, MULTIPART_THRESHOLD } from "../shared/multipart";
import type { User } from "../shared/types";

const resources: DatabaseSync[] = [];
afterEach(() => resources.splice(0).forEach((sql) => sql.close()));

function fixture() {
  const sql = new DatabaseSync(":memory:");
  resources.push(sql);
  // Include the rendition metadata contract; migration 0011 supplies these columns in the combined release.
  sql.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE posts (id TEXT PRIMARY KEY, status TEXT, created_by TEXT);
    CREATE TABLE media (id TEXT PRIMARY KEY, post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
      created_by TEXT, kind TEXT, status TEXT, original_object_key TEXT, byte_size INTEGER, mime_type TEXT,
      playback_object_key TEXT, playback_byte_size INTEGER, playback_status TEXT);
    INSERT INTO posts VALUES ('post', 'draft', 'owner');
    INSERT INTO media VALUES ('video', 'post', 'owner', 'video', 'pending', 'media/video/original.mp4',
      ${MULTIPART_THRESHOLD}, 'video/mp4', 'media/video/playback.mp4', ${MULTIPART_THRESHOLD}, 'pending');
  `);
  sql.exec(readFileSync("migrations/0012_multipart_uploads.sql", "utf8"));
  let failUpdate = false;
  const db = {
    prepare: (query: string) => ({
      bind: (...values: (string | number | null)[]) => ({
        first: async () => sql.prepare(query).get(...values) ?? null,
        run: async () => {
          if (failUpdate && query.includes("status = 'completed'")) {
            failUpdate = false;
            throw new Error("D1 disconnected");
          }
          return { meta: sql.prepare(query).run(...values) };
        },
      }),
    }),
  } as unknown as D1Database;
  const objects = new Map<string, { size: number; customMetadata: Record<string, string> }>();
  const r2Uploads = new Map<string, { key: string; customMetadata: Record<string, string> }>();
  const complete = vi.fn(async (uploadId: string, parts: R2UploadedPart[]) => {
    if (!parts.length) throw new Error("InvalidPart");
    const upload = r2Uploads.get(uploadId);
    if (!upload) throw new Error("NoSuchUpload");
    const object = { size: MULTIPART_THRESHOLD, customMetadata: upload.customMetadata };
    objects.set(upload.key, object);
    r2Uploads.delete(uploadId);
    return object;
  });
  const abort = vi.fn(async (uploadId: string) => {
    r2Uploads.delete(uploadId);
  });
  const bucket = {
    head: async (key: string) => objects.get(key) ?? null,
    createMultipartUpload: vi.fn(async (key: string, options: R2MultipartOptions) => {
      const uploadId = crypto.randomUUID();
      r2Uploads.set(uploadId, { key, customMetadata: options.customMetadata! });
      return { uploadId, abort: () => abort(uploadId) };
    }),
    resumeMultipartUpload: (_key: string, uploadId: string) => ({
      complete: (parts: R2UploadedPart[]) => complete(uploadId, parts),
      abort: () => abort(uploadId),
    }),
  };
  const env = {
    DB: db,
    MEDIA: bucket,
    R2_ACCOUNT_ID: "test-account",
    R2_BUCKET_NAME: "test-bucket",
    R2_ACCESS_KEY_ID: "test-access",
    R2_SECRET_ACCESS_KEY: "test-secret",
  } as unknown as Cloudflare.Env & R2Secrets;
  const app = new Hono<{ Bindings: typeof env; Variables: { currentUser: User } }>();
  app.use("*", async (c, next) => {
    const actor = c.req.header("x-test-actor");
    if (actor)
      c.set("currentUser", {
        id: actor,
        role: actor === "viewer" ? "viewer" : "uploader",
        displayName: actor,
        avatarUrl: null,
      });
    await next();
  });
  app.onError((error, c) => c.json({ error: error.message }, error instanceof ZodError ? 400 : 500));
  app.route("/", multipartRoutes);
  const request = (path = "", body?: unknown, actor: string | null = "owner", method = "POST") =>
    app.request(
      `/media/video/multipart${path}`,
      {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { "Content-Type": "application/json", ...(actor ? { "x-test-actor": actor } : {}) },
      },
      env,
    );
  const start = async () => {
    const response = await request("", { variant: "original", byteSize: MULTIPART_THRESHOLD });
    expect([200, 201]).toContain(response.status);
    return ((await response.json()) as { sessionId: string }).sessionId;
  };
  return {
    sql,
    request,
    start,
    bucket,
    complete,
    abort,
    objects,
    loseD1Update: () => {
      failUpdate = true;
    },
  };
}

function validParts() {
  return Array.from({ length: MULTIPART_THRESHOLD / MULTIPART_PART_SIZE }, (_, index) => ({
    partNumber: index + 1,
    etag: "a".repeat(32),
    byteSize: MULTIPART_PART_SIZE,
  }));
}

describe("署名付きR2分割アップロード", () => {
  it("ログイン・投稿権限・メディアと下書きの所有権をすべて検証する", async () => {
    const { request, start, sql, bucket } = fixture();
    const input = { variant: "original", byteSize: MULTIPART_THRESHOLD };
    expect((await request("", input, null)).status).toBe(401);
    expect((await request("", input, "viewer")).status).toBe(403);
    expect((await request("", input, "other")).status).toBe(404);
    const id = await start();
    for (const [path, method, body] of [
      [`/${id}/parts/1`, "POST", undefined],
      [`/${id}/complete`, "POST", { parts: validParts() }],
      [`/${id}`, "DELETE", undefined],
    ] as const)
      expect((await request(path, body, "other", method)).status).toBe(404);
    sql.prepare("UPDATE posts SET created_by = 'other'").run();
    expect((await request(`/${id}/parts/1`)).status).toBe(404);
    sql.prepare("DELETE FROM posts").run();
    expect((await request(`/${id}/complete`, { parts: validParts() })).status).toBe(404);
    expect(bucket.createMultipartUpload).toHaveBeenCalledTimes(1);
  });

  it("開始の応答喪失は同じセッションを返し、任意キーや容量上限の変更は拒否する", async () => {
    const { request, start, bucket } = fixture();
    expect(await start()).toBe(await start());
    expect(bucket.createMultipartUpload).toHaveBeenCalledTimes(1);
    expect(
      (await request("", { variant: "original", byteSize: MULTIPART_THRESHOLD, objectKey: "another.mp4" })).status,
    ).toBe(400);
    expect((await request("", { variant: "original", byteSize: MULTIPART_THRESHOLD + 1 })).status).toBe(409);
    expect((await request("", { variant: "original", byteSize: 501 * 1024 * 1024 })).status).toBe(400);
  });

  it("パート番号と固定容量を署名に含め、R2へ直接送信するURLだけを返す", async () => {
    const { request, start } = fixture();
    const id = await start();
    const result = (await (await request(`/${id}/parts/1`)).json()) as { uploadUrl: string; byteSize: number };
    const url = new URL(result.uploadUrl);
    expect(url.hostname).toBe("test-account.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/test-bucket/media/video/original.mp4");
    expect(url.searchParams.get("partNumber")).toBe("1");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(result.byteSize).toBe(MULTIPART_PART_SIZE);
    expect((await request(`/${id}/parts/0`)).status).toBe(400);
    expect((await request(`/${id}/parts/9`)).status).toBe(400);
  });

  it("欠落・重複・不正容量・ETagを確定前に拒否する", async () => {
    const { request, start, complete } = fixture();
    const id = await start();
    for (const parts of [
      validParts().slice(1),
      validParts().map((p) => ({ ...p, partNumber: 1 })),
      validParts().map((p) => ({ ...p, byteSize: p.byteSize - 1 })),
      validParts().map((p) => ({ ...p, etag: "invalid" })),
    ])
      expect((await request(`/${id}/complete`, { parts })).status).toBe(400);
    expect(complete).not.toHaveBeenCalled();
  });

  it("R2確定後にD1更新と応答を失っても同じオブジェクトをHEADで照合して再試行する", async () => {
    const { request, start, complete, loseD1Update, sql } = fixture();
    const id = await start();
    loseD1Update();
    expect((await request(`/${id}/complete`, { parts: validParts() })).status).toBe(500);
    expect((await request(`/${id}/complete`, { parts: validParts() })).status).toBe(200);
    expect((await request(`/${id}/complete`, { parts: validParts() })).status).toBe(200);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(sql.prepare("SELECT status FROM multipart_uploads").get()?.status).toBe("completed");
    expect(sql.prepare("SELECT status FROM media").get()?.status).toBe("pending");
  });

  it("アップロード済みメディアの再署名・再確定で公開中の元動画を上書きしない", async () => {
    const { request, start, sql, complete, objects } = fixture();
    const id = await start();
    sql.prepare("UPDATE media SET status = 'uploaded'").run();
    objects.set("media/video/original.mp4", {
      size: MULTIPART_THRESHOLD,
      customMetadata: { "multipart-session": "other-session" },
    });
    expect((await request("", { variant: "original", byteSize: MULTIPART_THRESHOLD })).status).toBe(409);
    expect((await request(`/${id}/parts/1`)).status).toBe(409);
    expect((await request(`/${id}/complete`, { parts: validParts() })).status).toBe(409);
    expect(complete).not.toHaveBeenCalled();
  });

  it("中止は冪等にR2を破棄し、次の開始では新しいセッションを使う", async () => {
    const { request, start, abort } = fixture();
    const id = await start();
    expect((await request(`/${id}`, undefined, "owner", "DELETE")).status).toBe(200);
    expect((await request(`/${id}`, undefined, "owner", "DELETE")).status).toBe(200);
    expect(abort).toHaveBeenCalledTimes(1);
    expect((await request(`/${id}/complete`, { parts: validParts() })).status).toBe(409);
    expect(await start()).not.toBe(id);
  });

  it("再生用の確保済みキーを選び、readyの動画は書き換えない", async () => {
    const { request, bucket, sql } = fixture();
    const response = await request("", { variant: "playback", byteSize: MULTIPART_THRESHOLD });
    expect(response.status).toBe(201);
    const { sessionId } = (await response.json()) as { sessionId: string };
    expect(bucket.createMultipartUpload.mock.calls[0][0]).toBe("media/video/playback.mp4");
    sql.prepare("UPDATE media SET playback_status = 'ready'").run();
    expect((await request(`/${sessionId}/parts/1`)).status).toBe(409);
    expect((await request(`/${sessionId}/complete`, { parts: validParts() })).status).toBe(409);
  });
});
