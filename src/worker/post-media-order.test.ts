import { describe, expect, it, vi } from "vitest";
import { app } from "./index";

const owner = { id: "01JDEVUSER0000000000000000", display_name: "Owner", role: "owner" };

function ownerEnv(onBatch: (statements: Array<{ sql: string; values: unknown[] }>) => void): Cloudflare.Env {
  return {
    APP_ORIGIN: "http://localhost:5173",
    DB: {
      prepare: (sql: string) => ({
        sql,
        values: [] as unknown[],
        bind(...values: unknown[]) {
          this.values = values;
          return this;
        },
        first: async () => (sql.includes("SELECT event_id FROM posts") ? { event_id: null } : owner),
        all: async () => ({
          results: [
            { id: "media-1", position: 0, status: "uploaded" },
            { id: "media-2", position: 1, status: "uploaded" },
          ],
        }),
      }),
      batch: async (statements: Array<{ sql: string; values: unknown[] }>) => {
        onBatch(statements);
        return [];
      },
    } as unknown as D1Database,
  } as Cloudflare.Env;
}

describe("投稿メディアの並び順API", () => {
  it("一時位置へ退避してから指定順へ更新する", async () => {
    const onBatch = vi.fn();
    const response = await app.request(
      "/api/posts/post-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: "",
          eventId: null,
          sceneId: null,
          mediaIds: ["media-2", "media-1"],
        }),
      },
      ownerEnv(onBatch),
    );

    expect(response.status).toBe(200);
    const statements = onBatch.mock.calls[0]?.[0] as Array<{ sql: string; values: unknown[] }>;
    expect(statements.some(({ sql, values }) => sql.includes("position = position + ?") && values[0] === 2)).toBe(true);
    expect(
      statements.filter(({ sql }) => sql.includes("UPDATE media SET position = ?")).map(({ values }) => values),
    ).toEqual([
      [0, "media-2", "post-1"],
      [1, "media-1", "post-1"],
    ]);
  });
});
