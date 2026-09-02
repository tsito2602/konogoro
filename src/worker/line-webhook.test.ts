import { describe, expect, it, vi } from "vitest";
import { app } from "./index";

const secret = "messaging-channel-secret";
type Statement = { sql: string; values: unknown[] };

async function signatureFor(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return btoa(String.fromCharCode(...signature));
}

function webhookEnv(
  onBatch: (statements: Statement[]) => Promise<unknown[]> = vi.fn(async () => []),
): Cloudflare.Env & { LINE_MESSAGING_CHANNEL_SECRET: string } {
  return {
    LINE_MESSAGING_CHANNEL_SECRET: secret,
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({ sql, values }),
      }),
      batch: onBatch,
    } as unknown as D1Database,
  } as unknown as Cloudflare.Env & { LINE_MESSAGING_CHANNEL_SECRET: string };
}

async function webhookRequest(body: string, signature?: string, env = webhookEnv()): Promise<Response> {
  return app.request(
    "/api/webhooks/line",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-line-signature": signature ?? (await signatureFor(body)) },
      body,
    },
    env,
  );
}

describe("LINE Webhook", () => {
  it("followとunfollowを一括反映する", async () => {
    const onBatch = vi.fn<(statements: Statement[]) => Promise<unknown[]>>(async () => []);
    const body = JSON.stringify({
      events: [
        { type: "follow", source: { type: "user", userId: "line-follow" } },
        { type: "unfollow", source: { type: "user", userId: "line-unfollow" } },
      ],
    });

    const response = await webhookRequest(body, await signatureFor(body), webhookEnv(onBatch));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    const statements = onBatch.mock.calls[0]![0];
    expect(statements).toHaveLength(2);
    expect(statements[0]?.sql).toContain("SET line_friend_enabled = 1");
    expect(statements[0]?.values).toEqual([expect.any(String), "line-follow"]);
    expect(statements[1]?.sql).toContain("line_friend_enabled = 0, notification_enabled = 0");
    expect(statements[1]?.values).toEqual([expect.any(String), "line-unfollow"]);
    expect(statements.every(({ sql }) => sql.includes("is_active = 1"))).toBe(true);
  });

  it("未知ユーザー、対象外イベント、ユーザーIDのないイベントを安全に無視する", async () => {
    const onBatch = vi.fn<(statements: Statement[]) => Promise<unknown[]>>(async () => []);
    const body = JSON.stringify({
      events: [
        { type: "message", source: { type: "user", userId: "line-user" } },
        { type: "follow", source: { type: "group", groupId: "group" } },
        null,
      ],
    });

    const response = await webhookRequest(body, await signatureFor(body), webhookEnv(onBatch));

    expect(response.status).toBe(200);
    expect(onBatch).not.toHaveBeenCalled();
  });

  it("署名が不正なリクエストをDB更新前に拒否する", async () => {
    const onBatch = vi.fn<(statements: Statement[]) => Promise<unknown[]>>(async () => []);
    const body = JSON.stringify({ events: [{ type: "unfollow", source: { userId: "line-user" } }] });

    const response = await webhookRequest(body, "invalid", webhookEnv(onBatch));

    expect(response.status).toBe(401);
    expect(onBatch).not.toHaveBeenCalled();
  });

  it("署名検証後も不正なJSONを拒否する", async () => {
    const body = "not-json";
    const response = await webhookRequest(body);

    expect(response.status).toBe(400);
  });

  it("Messaging APIのChannel Secretがなければ利用できない", async () => {
    const body = JSON.stringify({ events: [] });
    const response = await app.request("/api/webhooks/line", { method: "POST", body }, {
      DB: {} as D1Database,
    } as Cloudflare.Env);

    expect(response.status).toBe(503);
  });
});
