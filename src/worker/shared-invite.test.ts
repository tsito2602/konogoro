import { describe, expect, it, vi } from "vitest";
import { app } from "./index";

const owner = {
  id: "01JDEVUSER0000000000000000",
  display_name: "管理者",
  role: "owner",
  avatar_url: null,
};

describe("shared invite API", () => {
  it("未ログインでも有効な招待かだけを確認でき、非公開情報は返さない", async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () =>
            sql.includes("FROM invites WHERE token_hash")
              ? {
                  id: "invite-1",
                  expires_at: "2999-01-01T00:00:00.000Z",
                  max_uses: 100,
                  use_count: 0,
                  approval_required: 1,
                  closed_at: null,
                }
              : null,
        }),
      }),
    } as unknown as D1Database;
    const response = await app.request("/api/family/invites/shared-token/access", undefined, {
      DB: db,
      APP_ORIGIN: "https://family.example.com",
      LINE_CHANNEL_ID: "line-id",
      LINE_CHANNEL_SECRET: "line-secret",
    } as unknown as Cloudflare.Env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      available: true,
      reason: "available",
      authenticated: false,
      member: false,
      requestStatus: null,
      lineFriend: null,
    });
  });

  it("未ログインでの閲覧リクエスト送信を拒否する", async () => {
    const response = await app.request("/api/family/invites/shared-token/requests", { method: "POST" }, {
      DB: {} as D1Database,
      APP_ORIGIN: "https://family.example.com",
      LINE_CHANNEL_ID: "line-id",
      LINE_CHANNEL_SECRET: "line-secret",
    } as unknown as Cloudflare.Env);
    expect(response.status).toBe(401);
  });

  it("共通URLを閲覧者専用・承認必須・30日有効で発行する", async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const batch = vi.fn(async () => []);
    const db = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => {
          const statement = {
            sql,
            values,
            first: async () => (sql.includes("FROM users WHERE id") ? owner : null),
          };
          statements.push(statement);
          return statement;
        },
      }),
      batch,
    } as unknown as D1Database;
    const response = await app.request("/api/family/shared-invite", { method: "POST" }, {
      DB: db,
      APP_ORIGIN: "http://localhost:5173",
    } as unknown as Cloudflare.Env);

    expect(response.status).toBe(201);
    const result = await response.json<{ inviteUrl: string; expiresAt: string }>();
    expect(result.inviteUrl).toMatch(/^http:\/\/localhost:5173\/invite\/[A-Za-z0-9_-]{43}$/);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    expect(batch).toHaveBeenCalledOnce();
    expect(statements.some(({ sql }) => sql.includes("'viewer'") && sql.includes("1, NULL"))).toBe(true);
  });
});
