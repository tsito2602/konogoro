import { describe, expect, it } from "vitest";
import type { User } from "../shared/types";
import { app } from "./index";
import type { PostRow } from "./db";
import type { TimelineOrderRow } from "./timeline-order";

const developmentUser = {
  id: "01JDEVUSER0000000000000000",
  display_name: "つばさ",
  role: "owner" as User["role"],
  avatar_url: null,
};

function timelineRow(index: number): PostRow & TimelineOrderRow {
  const id = `post-${String(index).padStart(2, "0")}`;
  return {
    id,
    caption: "",
    event_id: "event-1",
    event_title: "春の旅行",
    event_start_date: "2026-04-10",
    event_end_date: "2026-04-12",
    scene_id: null,
    scene_title: null,
    captured_at: `2026-04-11T${String(23 - index).padStart(2, "0")}:00:00.000Z`,
    published_at: "2026-09-03T00:00:00.000Z",
    author_name: "つばさ",
    author_avatar_url: null,
    timeline_start_date: "2026-04-10",
    timeline_end_date: "2026-04-12",
    timeline_event_id: "event-1",
    timeline_post_date: `2026-04-11T${String(23 - index).padStart(2, "0")}:00:00.000Z`,
  };
}

function timelineEnv(role: User["role"], statements: Array<{ sql: string; values: unknown[] }>): Cloudflare.Env {
  const firstPage = Array.from({ length: 21 }, (_, index) => timelineRow(index));
  return {
    APP_ORIGIN: "http://localhost:5173",
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => {
          statements.push({ sql, values });
          return {
            first: async () => (sql.includes("FROM users WHERE id") ? { ...developmentUser, role } : { count: 0 }),
            all: async () => ({
              results:
                sql.includes("timeline_start_date") && sql.includes("p.status")
                  ? values.length === 1
                    ? firstPage
                    : []
                  : [],
            }),
          };
        },
      }),
    } as unknown as D1Database,
  } as unknown as Cloudflare.Env;
}

describe("GET /timeline", () => {
  it.each<User["role"]>(["owner", "uploader", "viewer"])("%sでも同じイベント時系列を返す", async (role) => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const response = await app.request("/api/timeline", undefined, timelineEnv(role, statements));
    const body = await response.json<{ posts: Array<{ id: string }>; nextCursor: string }>();

    expect(response.status).toBe(200);
    expect(body.posts.map(({ id }) => id)).toEqual(Array.from({ length: 20 }, (_, index) => timelineRow(index).id));
    expect(body.nextCursor).toBe("2026-04-10|2026-04-12|event-1|2026-04-11T04:00:00.000Z|post-19");
    const timelineQuery = statements.find(({ sql }) => sql.includes("timeline_start_date") && sql.includes("p.status"));
    expect(timelineQuery?.sql).toContain("COALESCE(e.start_date, e.end_date");
    expect(timelineQuery?.sql).toContain(
      "COALESCE(p.event_id, p.id) DESC, COALESCE(p.captured_at, p.published_at, p.created_at) DESC, p.id DESC",
    );
  });

  it("次ページで全ソートキーを同じ順序でbindする", async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const cursor = "2026-04-10|2026-04-12|event-1|2026-04-11T04:00:00.000Z|post-19";
    const response = await app.request(
      `/api/timeline?cursor=${encodeURIComponent(cursor)}`,
      undefined,
      timelineEnv("viewer", statements),
    );

    expect(response.status).toBe(200);
    const timelineQuery = statements.find(
      ({ sql }) => sql.includes("timeline_start_date") && sql.includes("< (?, ?, ?, ?, ?)"),
    );
    expect(timelineQuery?.values).toEqual([
      "2026-04-10",
      "2026-04-12",
      "event-1",
      "2026-04-11T04:00:00.000Z",
      "post-19",
      21,
    ]);
  });
});
