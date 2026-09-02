import { describe, expect, it } from "vitest";
import { eventTiming } from "./event-timing";

describe("eventTiming", () => {
  const today = "2026-09-02";

  it("期間内を進行中にする", () => {
    expect(eventTiming("2026-09-01", "2026-09-03", today)).toBe("ongoing");
  });

  it("開始前を予定にする", () => {
    expect(eventTiming("2026-09-10", "2026-09-12", today)).toBe("upcoming");
  });

  it("日付が片方だけなら1日のイベントとして扱う", () => {
    expect(eventTiming("2026-09-01", null, today)).toBe("past");
    expect(eventTiming(null, "2026-09-02", today)).toBe("ongoing");
  });

  it("日付がなければ日付未定にする", () => {
    expect(eventTiming(null, null, today)).toBe("undated");
  });
});
