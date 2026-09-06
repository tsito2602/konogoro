/// <reference types="node" />
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createSession } from "./auth";
import { app } from "./index";
import type { UploadTarget } from "../shared/types";

const owner = "01JDEVUSER0000000000000000";
const other = "other-uploader";

async function fixture() {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations").sort()) sql.exec(readFileSync(`migrations/${file}`, "utf8"));
  sql
    .prepare("INSERT INTO users (id,display_name,role,created_at,updated_at) VALUES (?,?,'uploader',?,?)")
    .run(other, "別の投稿者", "2026-09-01", "2026-09-01");
  const db = {
    prepare: (query: string) => ({
      bind: (...values: (string | number | null)[]) => ({
        first: async () => sql.prepare(query).get(...values) ?? null,
        all: async () => ({ results: sql.prepare(query).all(...values) }),
        run: async () => ({ meta: sql.prepare(query).run(...values) }),
      }),
    }),
    batch: async (statements: { run: () => Promise<unknown> }[]) => {
      sql.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sql.exec("COMMIT");
        return results;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  const env = {
    APP_ORIGIN: "http://localhost:5173",
    DB: db,
    LINE_CHANNEL_ID: "test-only",
    LINE_CHANNEL_SECRET: "test-only",
    R2_ACCOUNT_ID: "test-only",
    R2_ACCESS_KEY_ID: "test-only",
    R2_SECRET_ACCESS_KEY: "test-only",
    R2_BUCKET_NAME: "test-only",
  } as unknown as Cloudflare.Env;
  const session = await createSession(db, other);
  const post = (path: string, body: unknown, asOther = false) =>
    app.request(
      `/api${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(asOther ? { Cookie: `family_session=${session}` } : {}) },
        body: JSON.stringify(body),
      },
      env,
    );
  const create = async (asOther = false) => {
    const response = await post("/posts", { requestId: crypto.randomUUID(), caption: "旅行" }, asOther);
    expect(response.status).toBe(201);
    return ((await response.json()) as { id: string }).id;
  };
  const publishFixture = (id: string) =>
    sql.prepare("UPDATE posts SET status = 'published', published_at = ? WHERE id = ?").run("2026-09-01", id);
  return { sql, post, create, publishFixture };
}

const photo = () => ({
  requestId: crypto.randomUUID(),
  filename: "travel.jpg",
  mimeType: "image/jpeg",
  byteSize: 1234,
  capturedAt: null,
  durationSeconds: null,
});

describe("投稿・メディア確保APIの応答喪失からの再試行", () => {
  it("投稿作成の応答を失っても下書きを重複せず、再試行時の入力を保持する", async () => {
    const { sql, post } = await fixture();
    try {
      const requestId = crypto.randomUUID();
      expect((await post("/posts", { requestId, caption: "最初の入力" })).status).toBe(201);
      // Ignore the first response, as on a connection interruption after commit.
      const persistedId = sql.prepare("SELECT id FROM posts").get()?.id;
      const retry = await post("/posts", { requestId, caption: "見直した入力" });
      expect(retry.status).toBe(201);
      expect(await retry.json()).toEqual({ id: persistedId });
      expect(sql.prepare("SELECT id,caption,created_by FROM posts").all()).toEqual([
        { id: persistedId, caption: "見直した入力", created_by: owner },
      ]);
    } finally {
      sql.close();
    }
  });

  it("同じリクエストキーでも別の投稿者の下書きを再利用せず、他人の下書きへアップロードできない", async () => {
    const { sql, post } = await fixture();
    try {
      const requestId = crypto.randomUUID();
      const first = (await (await post("/posts", { requestId, caption: "所有者" })).json()) as { id: string };
      const second = (await (await post("/posts", { requestId, caption: "別の投稿者" }, true)).json()) as {
        id: string;
      };
      expect(first.id).not.toBe(second.id);
      expect(sql.prepare("SELECT created_by FROM posts WHERE id = ?").get(first.id)?.created_by).toBe(owner);
      expect(sql.prepare("SELECT created_by FROM posts WHERE id = ?").get(second.id)?.created_by).toBe(other);
      expect((await post(`/posts/${first.id}/media/upload-urls`, { files: [photo()] }, true)).status).toBe(404);
      expect(sql.prepare("SELECT COUNT(*) AS count FROM media").get()?.count).toBe(0);
    } finally {
      sql.close();
    }
  });

  it.each([false, true])(
    "公開済み=%s：確保応答を失ってもID・オブジェクトを増やさず、異なるファイルの再利用は拒否する",
    async (published) => {
      const { sql, post, create, publishFixture } = await fixture();
      try {
        const postId = await create();
        if (published) publishFixture(postId);
        const file = photo();
        const path = `/posts/${postId}/media/upload-urls`;
        expect((await post(path, { files: [file] })).status).toBe(201);
        const original = sql
          .prepare("SELECT id, original_object_key, position FROM media WHERE post_id = ?")
          .get(postId)!;
        const retry = await post(path, { files: [file] });
        expect(retry.status).toBe(201);
        const { media } = (await retry.json()) as { media: UploadTarget[] };
        expect(media).toHaveLength(1);
        expect(media[0].id).toBe(original.id);
        expect(new URL(media[0].uploadUrl).pathname).toBe(`/test-only/${original.original_object_key}`);
        expect(
          sql.prepare("SELECT id, original_object_key, position FROM media WHERE post_id = ?").all(postId),
        ).toEqual([original]);
        expect((await post(path, { files: [{ ...file, filename: "different.jpg" }] })).status).toBe(409);
        expect((await post(path, { files: [{ ...file, byteSize: 9999 }] })).status).toBe(409);
        expect(sql.prepare("SELECT COUNT(*) AS count FROM media").get()?.count).toBe(1);
      } finally {
        sql.close();
      }
    },
  );

  it("公開投稿で他の投稿者が同じキーを使っても既存メディアを上書きせず、重複キーの一括確保を拒否する", async () => {
    const { sql, post, create, publishFixture } = await fixture();
    try {
      const id = await create();
      publishFixture(id);
      const file = photo();
      const path = `/posts/${id}/media/upload-urls`;
      const first = (await (await post(path, { files: [file] })).json()) as { media: UploadTarget[] };
      const secondResponse = await post(path, { files: [file] }, true);
      expect(secondResponse.status).toBe(201);
      const second = (await secondResponse.json()) as { media: UploadTarget[] };
      expect(first.media[0].id).not.toBe(second.media[0].id);
      expect(sql.prepare("SELECT created_by FROM media ORDER BY position").all()).toEqual([
        { created_by: owner },
        { created_by: other },
      ]);
      expect((await post(path, { files: [file, file] })).status).toBe(400);
      expect(sql.prepare("SELECT COUNT(*) AS count FROM media").get()?.count).toBe(2);
    } finally {
      sql.close();
    }
  });
});
