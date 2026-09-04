import { describe, expect, it } from "vitest";
import {
  parseTimelineCursor,
  serializeTimelineCursor,
  timelineBeforeCursor,
  timelineCursorValues,
  timelineOrderBy,
} from "./timeline-order";

describe("timeline order", () => {
  it("イベント期間、イベント、投稿の順で安定した降順を定義する", () => {
    expect(timelineOrderBy).toContain("e.start_date");
    expect(timelineOrderBy).toContain("e.end_date");
    expect(timelineOrderBy).toContain("COALESCE(p.event_id, p.id) DESC");
    expect(timelineOrderBy).toContain("COALESCE(p.captured_at, p.published_at, p.created_at) DESC");
    expect(timelineOrderBy).toMatch(/p\.id DESC$/);
  });

  it("イベントのない投稿では投稿の日付を期間キーに使う", () => {
    expect(timelineOrderBy).toContain(
      "COALESCE(e.start_date, e.end_date, SUBSTR(COALESCE(p.captured_at, p.published_at, p.created_at), 1, 10))",
    );
  });

  it("ページングで全ソートキーを欠落なく引き継ぐ", () => {
    const row = {
      timeline_start_date: "2026-04-10",
      timeline_end_date: "2026-04-12",
      timeline_event_id: "event-1",
      timeline_post_date: "2026-04-11T10:00:00.000Z",
      id: "post-1",
    };
    const encoded = serializeTimelineCursor(row);
    const parsed = parseTimelineCursor(encoded);

    expect(parsed).toEqual(row);
    expect(parsed && timelineCursorValues(parsed)).toEqual(Object.values(row));
    expect(timelineBeforeCursor).toMatch(/< \(\?, \?, \?, \?, \?\)$/);
  });

  it("不完全なカーソルを先頭ページとして扱う", () => {
    expect(parseTimelineCursor("2026-04-10|event-1")).toBeNull();
  });
});
