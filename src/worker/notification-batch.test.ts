import { describe, expect, it } from "vitest";
import { getNotificationScheduledFor } from "./notification-batch";

describe("notification batch", () => {
  it("投稿時刻から10分後を通知予定時刻にする", () => {
    expect(getNotificationScheduledFor("2026-09-01T12:34:56.000Z")).toBe("2026-09-01T12:44:56.000Z");
  });

  it("日付をまたぐ場合もUTCのISO文字列を返す", () => {
    expect(getNotificationScheduledFor("2026-09-01T23:55:00.000Z")).toBe("2026-09-02T00:05:00.000Z");
  });
});
