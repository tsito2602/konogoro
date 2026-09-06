/// <reference types="node" />
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { app } from "./index";
import type { AlbumMedia } from "../shared/types";

it("イベント期間で分類・ページングし、撮影日時と公開範囲を維持する", async () => {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations").sort()) sql.exec(readFileSync(`migrations/${file}`, "utf8"));
  const db = {
    prepare: (query: string) => ({
      bind: (...values: (string | number | null)[]) => ({
        first: async () => sql.prepare(query).get(...values) ?? null,
        all: async () => ({ results: sql.prepare(query).all(...values) }),
      }),
    }),
  } as unknown as D1Database;
  const env = { DB: db, APP_ORIGIN: "http://localhost:5173" } as unknown as Cloudflare.Env;
  const user = "01JDEVUSER0000000000000000";
  try {
    const event = sql.prepare(
      "INSERT INTO events (id, title, start_date, end_date, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '2026-09-06', '2026-09-06')",
    );
    event.run("trip", "Fixture", "2025-12-30", "2026-01-02", user);
    event.run("end", "Fixture", null, "2026-02-01", user);
    event.run("start", "Fixture", "2026-03-31", null, user);
    event.run("undated", "Fixture", null, null, user);
    const post = sql.prepare(
      "INSERT INTO posts (id, event_id, status, created_by, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, '2026-09-06', '2026-09-06', '2026-09-06')",
    );
    for (const id of ["trip", "end", "start", "undated", "none", "draft"])
      post.run(id, ["none", "draft"].includes(id) ? null : id, id === "draft" ? "draft" : "published", user);
    const insert = sql.prepare(
      "INSERT INTO media (id, post_id, kind, status, original_filename, mime_type, original_object_key, position, created_by, created_at, captured_at) VALUES (?, ?, ?, ?, 'fixture', 'image/jpeg', ?, ?, ?, '2026-09-06', ?)",
    );
    for (let i = 0; i < 65; i++)
      insert.run(
        `trip-${String(i).padStart(3, "0")}`,
        "trip",
        i % 2 ? "video" : "image",
        "uploaded",
        `trip-${i}`,
        i,
        user,
        "2026-09-06T00:00:00.000Z",
      );
    for (const id of ["end", "start", "undated", "none", "draft"])
      insert.run(id, id, "image", "uploaded", id, 0, user, "2026-08-31T16:00:00.000Z");
    insert.run("pending", "none", "image", "pending", "pending", 1, user, "2026-09-06");
    const all: AlbumMedia[] = [];
    let cursor: string | null = null;
    do {
      const response = await app.request(
        `/api/album${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        undefined,
        env,
      );
      expect(response.status).toBe(200);
      const body: { media: AlbumMedia[]; nextCursor: string | null } = await response.json();
      all.push(...body.media);
      cursor = body.nextCursor;
    } while (cursor);
    expect(all).toHaveLength(69);
    expect(new Set(all.map((m) => m.id)).size).toBe(69);
    expect(all.slice(0, 4).map((m) => [m.id, m.albumDate])).toEqual([
      ["undated", "2026-09-01"],
      ["none", "2026-09-01"],
      ["start", "2026-03-31"],
      ["end", "2026-02-01"],
    ]);
    expect(all.slice(4).every((m) => m.albumDate === "2025-12-30" && m.capturedAt === "2026-09-06T00:00:00.000Z")).toBe(
      true,
    );
    expect(all.some((m) => m.kind === "video")).toBe(true);
    sql.prepare("UPDATE events SET start_date = '2026-08-31', end_date = '2026-09-02' WHERE id = 'trip'").run();
    const updated = await app.request("/api/album", undefined, env);
    const body = await updated.json<{ media: AlbumMedia[] }>();
    expect(body.media.find((m) => m.postId === "trip")?.albumDate).toBe("2026-08-31");
  } finally {
    sql.close();
  }
});
