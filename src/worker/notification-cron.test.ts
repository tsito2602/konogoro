import { describe, expect, it, vi } from "vitest";
import { notificationRetryKey, processNotificationBatches } from "./notification-cron";

describe("notificationRetryKey", () => {
  it("batchとuserごとに安定したUUIDを生成する", async () => {
    const first = await notificationRetryKey("batch-1", "user-1");
    expect(first).toBe(await notificationRetryKey("batch-1", "user-1"));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).not.toBe(await notificationRetryKey("batch-1", "user-2"));
  });
});

describe("processNotificationBatches", () => {
  it("batch内で最も新しく公開された投稿へのURLを送る", async () => {
    const sqlStatements: string[] = [];
    const db = {
      prepare: (sql: string) => {
        sqlStatements.push(sql);
        const statement = {
          bind: () => statement,
          all: async () => {
            if (sql.includes("FROM notification_batches")) {
              return {
                results: [
                  {
                    id: "batch-1",
                    post_count: 2,
                    photo_count: 3,
                    video_count: 0,
                    latest_post_id: "post-2",
                  },
                ],
              };
            }
            return { results: [{ id: "user-1", line_user_id: "U123" }] };
          },
          run: async () => ({}),
        };
        return statement;
      },
    } as unknown as D1Database;
    const messages: string[] = [];
    const send = vi.fn(async (notification: { text: string }) => {
      messages.push(notification.text);
    });

    await processNotificationBatches(
      {
        DB: db,
        MEDIA: {} as R2Bucket,
        R2_BUCKET_NAME: "family-timeline-media",
        LINE_CHANNEL_ACCESS_TOKEN: "line-token",
        APP_ORIGIN: "https://family.example.com",
      },
      new Date("2026-09-03T00:00:00.000Z"),
      send,
    );

    expect(sqlStatements[0]).toContain("ORDER BY latest_post.published_at DESC, latest_post.id DESC");
    expect(send).toHaveBeenCalledOnce();
    expect(messages).toEqual([expect.stringContaining("https://family.example.com/posts/post-2")]);
  });
});
