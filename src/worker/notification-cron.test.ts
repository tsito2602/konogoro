import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addPostToNotificationBatch } from "./notification-batch";
import { LineDeliveryError, sendLineNotification } from "./line-messaging";
import { notificationRetryKey, processNotificationBatches, type NotificationCronEnv } from "./notification-cron";

const connections: DatabaseSync[] = [];
afterEach(() => {
  for (const db of connections.splice(0)) db.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const start = "2026-09-20T06:14:00.000Z";
const due = new Date("2026-09-20T06:24:00.000Z");
const later = (minutes: number) => new Date(due.getTime() + minutes * 60_000);

function fixture(migrate = true) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(due);
  const sql = new DatabaseSync(":memory:");
  connections.push(sql);
  const folder = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(folder).sort()) {
    if (file.endsWith(".sql") && !file.startsWith("0015")) sql.exec(readFileSync(new URL(file, folder), "utf8"));
  }
  const upgrade = () => sql.exec(readFileSync(new URL("0015_notification_deliveries.sql", folder), "utf8"));
  if (migrate) upgrade();
  class Statement {
    constructor(
      readonly query: string,
      readonly values: SQLInputValue[] = [],
    ) {}
    bind(...values: SQLInputValue[]) {
      return new Statement(this.query, values);
    }
    async first() {
      return sql.prepare(this.query).get(...this.values) ?? null;
    }
    async all() {
      return { results: sql.prepare(this.query).all(...this.values) };
    }
    execute() {
      return sql.prepare(this.query).run(...this.values);
    }
    async run() {
      return { meta: this.execute() };
    }
  }
  const db = {
    prepare: (query: string) => new Statement(query),
    batch: async (statements: Statement[]) => {
      sql.exec("BEGIN");
      try {
        const results = statements.map((s) => s.execute());
        sql.exec("COMMIT");
        return results;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  const env = {
    DB: db,
    MEDIA: {} as R2Bucket,
    R2_BUCKET_NAME: "family-timeline-media",
    LINE_CHANNEL_ACCESS_TOKEN: "test-token",
    APP_ORIGIN: "https://family-timeline.tsito-apps.workers.dev",
    LINE_NOTIFICATION_ORIGIN: "https://konogoro.tsito-apps.workers.dev",
  } satisfies NotificationCronEnv;
  const user = (id: string) =>
    sql
      .prepare(
        `
    INSERT INTO users (id, display_name, role, created_at, updated_at, line_user_id, notification_enabled, line_friend_enabled, is_active)
    VALUES (?, 'test member', 'viewer', ?, ?, ?, 1, 1, 1)
  `,
      )
      .run(id, start, start, id);
  const post = (id: string) =>
    sql
      .prepare(
        `
    INSERT INTO posts (id, caption, status, created_by, created_at, updated_at, published_at)
    VALUES (?, '', 'published', '01JDEVUSER0000000000000000', ?, ?, ?)
  `,
      )
      .run(id, start, start, start);
  const register = async (id: string, at = start) => {
    post(id);
    return addPostToNotificationBatch(db, id, at);
  };
  const rows = (query: string) => sql.prepare(query).all();
  return { sql, db, env, user, post, register, rows, upgrade };
}

describe("notification deliveries", () => {
  it("宛先ごとの安定したretry key", async () => {
    const key = await notificationRetryKey("batch", "user");
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(key).toBe(await notificationRetryKey("batch", "user"));
    expect(key).not.toBe(await notificationRetryKey("batch", "other"));
  });

  it("10分待機・追加で延長・二重公開を1回にまとめる", async () => {
    const f = fixture();
    f.user("A");
    const id = await f.register("p1");
    expect(await addPostToNotificationBatch(f.db, "p1", start)).toBe(id);
    expect(await f.register("p2", "2026-09-20T06:19:00.000Z")).toBe(id);
    const send = vi.fn(async () => {});
    await processNotificationBatches(f.env, due, send);
    expect(send).not.toHaveBeenCalled();
    await processNotificationBatches(f.env, later(5), send);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]).toEqual([
      expect.objectContaining({
        text: "新しい思い出が届きました。投稿2件\nまとめて見る：https://konogoro.tsito-apps.workers.dev/unread",
      }),
    ]);
    await processNotificationBatches(f.env, later(1440), send);
    expect(send).toHaveBeenCalledOnce();
  });

  it("一部失敗後に新しい投稿を分離し、翌日も成功済みの投稿を再送しない", async () => {
    const f = fixture();
    f.user("A");
    f.user("B");
    const first = await f.register("p1");
    const send = vi.fn<typeof sendLineNotification>(async (n) => {
      if (n.to === "B") throw new LineDeliveryError(503);
    });
    await processNotificationBatches(f.env, due, send);
    expect(f.rows("SELECT user_id, state FROM notification_deliveries ORDER BY user_id")).toEqual([
      { user_id: "A", state: "accepted" },
      { user_id: "B", state: "pending" },
    ]);
    const second = await f.register("p2", later(2).toISOString());
    expect(second).not.toBe(first);
    await processNotificationBatches(f.env, later(12), send);
    const a = send.mock.calls.map(([n]) => n).filter((n) => n.to === "A");
    expect(a).toHaveLength(2);
    expect(a.every((n) => n.text.includes("投稿1件"))).toBe(true);
    expect(a[0].retryKey).not.toBe(a[1].retryKey);
    const before = send.mock.calls.length;
    await processNotificationBatches(f.env, later(1440), send);
    expect(send.mock.calls).toHaveLength(before);
    expect(f.rows("SELECT state FROM notification_deliveries WHERE user_id = 'B'")).toEqual([
      { state: "expired" },
      { state: "expired" },
    ]);
  });

  it("再試行は本文・宛先・キーを固定し、成功した宛先には再送しない", async () => {
    const f = fixture();
    f.user("A");
    f.user("B");
    await f.register("p1");
    const send = vi
      .fn<typeof sendLineNotification>()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue();
    await processNotificationBatches(f.env, due, send);
    f.user("C");
    f.sql.exec("DELETE FROM posts WHERE id = 'p1'");
    await processNotificationBatches(
      { ...f.env, LINE_NOTIFICATION_ORIGIN: "https://changed.example.com" } as unknown as NotificationCronEnv,
      later(1),
      send,
    );
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[2][0]).toEqual(send.mock.calls[1][0]);
    expect(f.rows("SELECT state FROM notification_deliveries")).toEqual([{ state: "accepted" }, { state: "accepted" }]);
  });

  it("並行cronと送信中の新規投稿を安全に扱う", async () => {
    const f = fixture();
    f.user("A");
    const first = await f.register("p1");
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const send = vi.fn<typeof sendLineNotification>(async () => {
      entered();
      await waiting;
    });
    const run = processNotificationBatches(f.env, due, send);
    await started;
    const second = await f.register("p2", later(1).toISOString());
    expect(second).not.toBe(first);
    await processNotificationBatches(f.env, due, send);
    expect(send).toHaveBeenCalledOnce();
    release();
    await run;
    expect(f.rows("SELECT post_count FROM notification_dispatches WHERE state = 'completed'")).toEqual([
      { post_count: 1 },
    ]);
  });

  it("二つのcronが同時開始しても送信は1回", async () => {
    const f = fixture();
    f.user("A");
    await f.register("p1");
    const send = vi.fn<typeof sendLineNotification>(async () => {});
    await Promise.all([processNotificationBatches(f.env, due, send), processNotificationBatches(f.env, due, send)]);
    expect(send).toHaveBeenCalledOnce();
  });

  it("送信開始時の写真・動画件数を再送でも維持する", async () => {
    const f = fixture();
    f.user("A");
    await f.register("p1");
    const media = (id: string, kind: string, position: number) =>
      f.sql
        .prepare(
          `
      INSERT INTO media (id,post_id,kind,status,original_filename,mime_type,original_object_key,position,created_by,created_at)
      VALUES (?,'p1',?,'uploaded','test','application/octet-stream',?,?,'01JDEVUSER0000000000000000',?)
    `,
        )
        .run(id, kind, id, position, start);
    media("photo", "image", 0);
    media("video", "video", 1);
    const send = vi.fn<typeof sendLineNotification>().mockRejectedValueOnce(new Error("timeout")).mockResolvedValue();
    await processNotificationBatches(f.env, due, send);
    expect(send.mock.calls[0][0].text).toContain("投稿1件（写真1枚・動画1本）");
    media("extra", "image", 2);
    await processNotificationBatches(f.env, later(1), send);
    expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);
  });

  it("通知前に投稿が削除された場合や対象者がいない場合は空通知を送らない", async () => {
    const f = fixture();
    f.user("A");
    await f.register("p1");
    f.sql.exec("DELETE FROM posts WHERE id = 'p1'");
    const send = vi.fn<typeof sendLineNotification>();
    await processNotificationBatches(f.env, due, send);
    f.sql.exec("UPDATE users SET notification_enabled = 0");
    await f.register("p2");
    await processNotificationBatches(f.env, due, send);
    expect(send).not.toHaveBeenCalled();
    expect(f.rows("SELECT state FROM notification_dispatches")).toEqual([
      { state: "completed" },
      { state: "completed" },
    ]);
  });

  it.each(["notification_enabled = 0", "is_active = 0", "line_friend_enabled = 0", "line_user_id = 'changed'"])(
    "再送前の受信条件変更を尊重する: %s",
    async (change) => {
      const f = fixture();
      f.user("A");
      await f.register("p1");
      const send = vi.fn<typeof sendLineNotification>().mockRejectedValue(new Error("timeout"));
      await processNotificationBatches(f.env, due, send);
      f.sql.exec(`UPDATE users SET ${change} WHERE id = 'A'`);
      await processNotificationBatches(f.env, later(1), send);
      expect(send).toHaveBeenCalledOnce();
      expect(f.rows("SELECT state FROM notification_deliveries")).toEqual([{ state: "skipped" }]);
    },
  );

  it.each([400, 401, 403, 409])("恒久エラー%sでは毎分再試行しない", async (status) => {
    const f = fixture();
    f.user("A");
    await f.register("p1");
    const send = vi.fn<typeof sendLineNotification>().mockRejectedValue(new LineDeliveryError(status));
    await processNotificationBatches(f.env, due, send);
    await processNotificationBatches(f.env, later(1), send);
    expect(send).toHaveBeenCalledOnce();
    expect(f.rows("SELECT state FROM notification_deliveries")).toEqual([{ state: "failed" }]);
  });

  it("429はバックオフし、23時間境界では再送しない", async () => {
    const f = fixture();
    f.user("A");
    await f.register("p1");
    const send = vi.fn<typeof sendLineNotification>().mockRejectedValue(new LineDeliveryError(429));
    await processNotificationBatches(f.env, due, send);
    await processNotificationBatches(f.env, new Date(due.getTime() + 30_000), send);
    expect(send).toHaveBeenCalledOnce();
    await processNotificationBatches(f.env, later(1), send);
    expect(send).toHaveBeenCalledTimes(2);
    await processNotificationBatches(f.env, later(23 * 60), send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("送信結果の保存に失敗しても、再試行の受付済み409で完了する", async () => {
    const f = fixture();
    f.user("A");
    await f.register("p1");
    f.sql.exec(`CREATE TRIGGER fail_receipt BEFORE UPDATE OF state ON notification_deliveries
      WHEN NEW.state = 'accepted' BEGIN SELECT RAISE(FAIL, 'test storage error'); END`);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValue(new Response(null, { status: 409, headers: { "x-line-accepted-request-id": "request" } }));
    const send: typeof sendLineNotification = (n) => sendLineNotification({ ...n, fetcher });
    await processNotificationBatches(f.env, due, send);
    f.sql.exec("DROP TRIGGER fail_receipt");
    await processNotificationBatches(f.env, later(1), send);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(f.rows("SELECT state FROM notification_deliveries")).toEqual([{ state: "accepted" }]);
  });

  it("移行は旧pendingを保全・自動再送停止し、既存投稿を新通知へ再登録しない", async () => {
    const f = fixture(false);
    f.user("A");
    f.post("old");
    f.sql
      .prepare(
        "INSERT INTO notification_batches (id,status,scheduled_for,created_at,last_error) VALUES ('old','pending',?,?,'failure')",
      )
      .run(start, start);
    f.sql.prepare("INSERT INTO notification_batch_posts VALUES ('old','old',?)").run(start);
    f.upgrade();
    expect(f.rows("SELECT status,last_error FROM notification_legacy_holds")).toEqual([
      { status: "pending", last_error: "failure" },
    ]);
    expect(f.rows("SELECT id FROM notification_batches WHERE status = 'pending'")).toEqual([]);
    expect(await addPostToNotificationBatch(f.db, "old", start)).toBe("old");
    expect(f.rows("SELECT id FROM notification_dispatches")).toEqual([]);
    const send = vi.fn<typeof sendLineNotification>();
    await processNotificationBatches(f.env, due, send);
    expect(send).not.toHaveBeenCalled();
    await f.register("new");
    send.mockResolvedValue();
    await processNotificationBatches(f.env, due, send);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].text).toContain("投稿1件");
  });

  it("staging・トークンなしではDBも送信も呼ばない", async () => {
    const f = fixture();
    const prepare = vi.spyOn(f.db, "prepare");
    const send = vi.fn<typeof sendLineNotification>();
    await processNotificationBatches({ ...f.env, STAGING: "true" }, due, send);
    await processNotificationBatches({ ...f.env, LINE_CHANNEL_ACCESS_TOKEN: undefined }, due, send);
    expect(prepare).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
