/// <reference types="node" />
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { app } from "./index";

function fixture() {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations").sort()) sql.exec(readFileSync(`migrations/${file}`, "utf8"));
  sql.exec(`INSERT INTO events (id,title,created_by,created_at,updated_at) VALUES ('event-1','旅行','01JDEVUSER0000000000000000','2026-09-01','2026-09-01');
    INSERT INTO posts (id,event_id,status,created_by,created_at,updated_at) VALUES ('post-1','event-1','published','01JDEVUSER0000000000000000','2026-09-01','2026-09-01');
    INSERT INTO media (id,post_id,kind,status,original_filename,mime_type,original_object_key,position,created_by,created_at) VALUES ('image-1','post-1','image','uploaded','image.jpg','image/jpeg','image',0,'01JDEVUSER0000000000000000','2026-09-01'),('video-1','post-1','video','uploaded','video.mp4','video/mp4','video',1,'01JDEVUSER0000000000000000','2026-09-01');`);
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
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sql.exec("COMMIT");
        return result;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const env = { APP_ORIGIN: "http://localhost:5173", DB: db } as unknown as Cloudflare.Env;
  const save = (coverMediaId: string | null, coverPosition = { x: 20, y: 80 }) =>
    app.request(
      "/api/events/event-1/manage",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: { title: "旅行" }, scenes: [], coverMediaId, coverPosition }),
      },
      env,
    );
  return { sql, env, save };
}

describe("event cover position persistence", () => {
  it.each(["image-1", "video-1"])("%sの位置を一括保存し一覧に返し、自動選択で中央へ戻す", async (id) => {
    const { sql, env, save } = fixture();
    try {
      expect(sql.prepare("SELECT cover_position_x FROM events").get()?.cover_position_x).toBe(50);
      expect((await save(id)).status).toBe(200);
      const response = await app.request("/api/events", {}, env);
      const result = (await response.json()) as {
        events: { coverSource: string; coverPosition: { x: number; y: number } }[];
      };
      expect(result.events[0]).toMatchObject({ coverSource: "manual", coverPosition: { x: 20, y: 80 } });
      expect((await save(null)).status).toBe(200);
      expect(
        sql.prepare("SELECT cover_source, cover_media_id, cover_position_x, cover_position_y FROM events").get(),
      ).toEqual({ cover_source: "auto", cover_media_id: "image-1", cover_position_x: 50, cover_position_y: 50 });
    } finally {
      sql.close();
    }
  });
  it("撮影日がない場合も公開日時順でプレビュー候補と自動カバーが一致する", async () => {
    const { sql, env, save } = fixture();
    try {
      sql.exec(`UPDATE posts SET published_at = '2026-09-05' WHERE id = 'post-1';
        INSERT INTO posts (id,event_id,status,created_by,published_at,created_at,updated_at) VALUES ('post-2','event-1','published','01JDEVUSER0000000000000000','2026-09-03','2026-09-02','2026-09-02');
        INSERT INTO media (id,post_id,kind,status,original_filename,mime_type,original_object_key,position,created_by,created_at) VALUES ('image-2','post-2','image','uploaded','image2.jpg','image/jpeg','image2',0,'01JDEVUSER0000000000000000','2026-09-02');`);
      const candidates = await app.request("/api/events/event-1/cover-media", {}, env);
      const body = (await candidates.json()) as { media: { id: string; kind: string }[] };
      expect(body.media.find((item) => item.kind === "image")?.id).toBe("image-2");
      expect((await save(null)).status).toBe(200);
      expect(sql.prepare("SELECT cover_media_id FROM events").get()?.cover_media_id).toBe("image-2");
      expect((await save("image-1")).status).toBe(200);
      const reset = await app.request(
        "/api/events/event-1/cover",
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mediaId: null }) },
        env,
      );
      expect(reset.status).toBe(200);
      expect(sql.prepare("SELECT cover_media_id FROM events").get()?.cover_media_id).toBe("image-2");
    } finally {
      sql.close();
    }
  });
  it("範囲外の位置と無関係なメディアは既存状態を変更せず拒否する", async () => {
    const { sql, save } = fixture();
    try {
      expect((await save("image-1", { x: -1, y: 50 })).status).toBe(400);
      expect((await save("other-media")).status).toBe(400);
      expect(sql.prepare("SELECT cover_source, cover_position_x FROM events").get()).toEqual({
        cover_source: "auto",
        cover_position_x: 50,
      });
    } finally {
      sql.close();
    }
  });
});
