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

describe("投稿編集の見出し管理", () => {
  const newId = "12345678-1234-4234-8234-123456789abc";
  async function update(env: Cloudflare.Env, scenes: unknown[], sceneId = "scene-1") {
    return app.request(
      "/api/posts/post-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: "更新", eventId: "event-1", sceneId, scenes }),
      },
      env,
    );
  }
  function setup() {
    const f = fixture();
    f.sql.exec(
      `INSERT INTO event_scenes (id,event_id,title,sort_order,created_by,created_at,updated_at) VALUES ('scene-1','event-1','朝',0,'01JDEVUSER0000000000000000','2026-09-01','2026-09-01'),('scene-2','event-1','夜',1,'01JDEVUSER0000000000000000','2026-09-01','2026-09-01'); UPDATE posts SET scene_id = 'scene-1';`,
    );
    return f;
  }
  it("既存見出しのIDと投稿の関連を維持して、追加・編集・並び順を一括保存する", async () => {
    const { sql, env } = setup();
    try {
      const scenes = [
        { id: "scene-2", title: "夕方" },
        { id: newId, title: "昼", isNew: true },
        { id: "scene-1", title: "朝食" },
      ];
      expect((await update(env, scenes)).status).toBe(200);
      expect(sql.prepare("SELECT id,title,sort_order FROM event_scenes ORDER BY sort_order").all()).toEqual([
        { id: "scene-2", title: "夕方", sort_order: 0 },
        { id: newId, title: "昼", sort_order: 1 },
        { id: "scene-1", title: "朝食", sort_order: 2 },
      ]);
      expect(sql.prepare("SELECT scene_id FROM posts").get()?.scene_id).toBe("scene-1");
      expect((await update(env, scenes, newId)).status).toBe(200);
      expect(sql.prepare("SELECT COUNT(*) AS n FROM event_scenes").get()?.n).toBe(3);
      expect(sql.prepare("SELECT scene_id FROM posts").get()?.scene_id).toBe(newId);
    } finally {
      sql.close();
    }
  });
  it.each([
    [{ id: "scene-1", title: "変更" }],
    [
      { id: "scene-1", title: "変更" },
      { id: "scene-2", title: "夜" },
      { id: "missing", title: "不明" },
    ],
    [
      { id: "scene-1", title: " " },
      { id: "scene-2", title: "夜" },
    ],
  ])("不正または古い見出し一覧を保存しても投稿と見出しを変更しない: %j", async (...scenes) => {
    const { sql, env } = setup();
    try {
      expect((await update(env, scenes)).status).toBeGreaterThanOrEqual(400);
      expect(sql.prepare("SELECT title FROM event_scenes WHERE id = 'scene-1'").get()?.title).toBe("朝");
      expect(sql.prepare("SELECT caption FROM posts").get()?.caption).toBe("");
    } finally {
      sql.close();
    }
  });
});
