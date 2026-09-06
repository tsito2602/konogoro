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
    // A full first page in the latest month must not hide older months from navigation.
    for (let i = 0; i < 61; i++)
      insert.run(`latest-${i}`, "none", "image", "uploaded", `latest-${i}`, i + 2, user, "2026-09-06T00:00:00.000Z");
    const initial = await app.request("/api/album", undefined, env);
    const initialBody = await initial.json<{ media: AlbumMedia[]; nextCursor: string | null }>();
    expect(initialBody.media).toHaveLength(60);
    expect(initialBody.media.every((m) => m.albumDate?.startsWith("2026-09"))).toBe(true);
    expect(initialBody.nextCursor).toBeTruthy();
    const months = await app.request("/api/album/months", undefined, env);
    expect(months.status).toBe(200);
    expect(await months.json()).toEqual({
      months: [
        { key: "2026-09", count: 63 },
        { key: "2026-03", count: 1 },
        { key: "2026-02", count: 1 },
        { key: "2025-12", count: 65 },
      ],
    });
    for (const filter of ["month=2025-12", "year=2025"]) {
      const scoped: AlbumMedia[] = [];
      let next: string | null = null;
      let pages = 0;
      do {
        const response = await app.request(
          `/api/album?${filter}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`,
          undefined,
          env,
        );
        expect(response.status).toBe(200);
        const body = await response.json<{ media: AlbumMedia[]; nextCursor: string | null }>();
        scoped.push(...body.media);
        next = body.nextCursor;
        pages++;
        expect(pages).toBeLessThanOrEqual(2);
      } while (next);
      expect(pages).toBe(2);
      expect(scoped).toHaveLength(65);
      expect(new Set(scoped.map((m) => m.id)).size).toBe(65);
      expect(scoped.every((m) => m.albumDate === "2025-12-30")).toBe(true);
    }
    const empty = await app.request("/api/album?month=2024-01", undefined, env);
    expect(await empty.json()).toEqual({ media: [], nextCursor: null });
    const currentYear = await app.request("/api/album?year=2026", undefined, env);
    const currentBody = await currentYear.json<{ media: AlbumMedia[]; nextCursor: string }>();
    const remainingYear = await app.request(
      `/api/album?year=2026&cursor=${encodeURIComponent(currentBody.nextCursor)}`,
      undefined,
      env,
    );
    const remainingBody = await remainingYear.json<{ media: AlbumMedia[]; nextCursor: string | null }>();
    expect(currentBody.media.length + remainingBody.media.length).toBe(65);
    expect(remainingBody.nextCursor).toBeNull();
    expect(remainingBody.media.map((m) => m.albumDate)).toContain("2026-02-01");
    for (const filter of [
      "month=2026-00",
      "month=2026-13",
      "month=2026-1",
      "month=",
      "year=26",
      "year=",
      "year=2026&month=2026-09",
      "month=2026-09%27",
    ]) {
      const response = await app.request(`/api/album?${filter}`, undefined, env);
      expect(response.status).toBe(400);
    }
    const securedEnv = {
      ...env,
      APP_ORIGIN: "https://example.test",
      LINE_CHANNEL_ID: "fixture",
      LINE_CHANNEL_SECRET: "fixture",
    };
    for (const path of ["/api/album/months", "/api/album?month=2025-12"]) {
      const response = await app.request(path, undefined, securedEnv);
      expect(response.status).toBe(401);
    }
    sql.prepare("DELETE FROM media WHERE id LIKE 'latest-%'").run();
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
