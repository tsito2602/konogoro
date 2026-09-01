import { describe, expect, it } from "vitest";
import { notificationRetryKey } from "./notification-cron";

describe("notificationRetryKey", () => {
  it("batchとuserごとに安定したUUIDを生成する", async () => {
    const first = await notificationRetryKey("batch-1", "user-1");
    expect(first).toBe(await notificationRetryKey("batch-1", "user-1"));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).not.toBe(await notificationRetryKey("batch-1", "user-2"));
  });
});
