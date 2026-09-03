import { describe, expect, it } from "vitest";
import { hashToken, safeReturnPath } from "./auth";
import { app } from "./index";

describe("LINE Login", () => {
  it("ブラウザをまたいで復元できるよう認証要求をD1へ保存する", async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => {
          const statement = { sql, values };
          statements.push(statement);
          return statement;
        },
      }),
      batch: async () => [],
    } as unknown as D1Database;

    const response = await app.request(
      "/api/auth/line?invite=invite-token&returnTo=%2Fposts%2Fpost-1%3Ffrom%3Dline",
      undefined,
      {
        DB: db,
        APP_ORIGIN: "https://example.com",
        LINE_CHANNEL_ID: "line-channel-id",
        LINE_CHANNEL_SECRET: "line-channel-secret",
      } as unknown as Cloudflare.Env,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("https://access.line.me/oauth2/v2.1/authorize");
    expect(response.headers.get("Set-Cookie")).toContain("line_state=");
    expect(response.headers.get("Set-Cookie")).toContain("line_return_to=");
    expect(response.headers.get("Set-Cookie")).toContain("Path=/");
    expect(response.headers.get("Set-Cookie")).not.toContain("line_nonce");
    expect(statements.some(({ sql }) => sql.includes("INSERT INTO line_login_requests"))).toBe(true);
    const inserted = statements.find(({ sql }) => sql.includes("INSERT INTO line_login_requests"));
    expect(inserted?.values[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(inserted?.values[3]).toBe(await hashToken("invite-token"));
  });

  it.each([
    ["/posts/post-1?from=line#comments", "/posts/post-1?from=line#comments"],
    ["https://evil.example/posts/post-1", "/"],
    ["//evil.example/posts/post-1", "/"],
    ["/\\\\evil.example/posts/post-1", "/"],
    [null, "/"],
  ])("ログイン後の遷移先を安全なアプリ内パスに限定する", (value, expected) => {
    expect(safeReturnPath(value)).toBe(expected);
  });
});
