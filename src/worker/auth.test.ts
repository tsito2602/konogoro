import { describe, expect, it } from "vitest";
import {
  createSession,
  getCurrentUser,
  getLineFriendship,
  hashToken,
  pkceChallenge,
  randomToken,
  refreshSession,
  safeEqual,
  SESSION_MAX_AGE_SECONDS,
} from "./auth";

describe("auth helpers", () => {
  it("URL-safeなtokenを生成する", () => expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/));
  it("PKCE challengeを生成する", async () =>
    expect(await pkceChallenge("test-verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/));
  it("tokenをhash化する", async () => expect(await hashToken("token")).toHaveLength(64));
  it("文字列を比較する", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
  });
  it("90日間のsessionを作成する", async () => {
    let values: unknown[] = [];
    const db = {
      prepare: () => ({
        bind: (...bound: unknown[]) => {
          values = bound;
          return { run: async () => ({ success: true }) };
        },
      }),
    } as unknown as D1Database;

    const now = new Date("2026-09-03T00:00:00.000Z");
    const session = await createSession(db, "user-1", now);

    expect(session).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(values[0]).toBe(await hashToken(session));
    expect(values[1]).toBe("user-1");
    expect(values[2]).toBe(new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString());
    expect(values[3]).toBe(now.toISOString());
  });
  it("有効期限が1日以上減ったsessionを最終利用から90日へ更新する", async () => {
    let query = "";
    let values: unknown[] = [];
    const db = {
      prepare: (sql: string) => {
        query = sql;
        return {
          bind: (...bound: unknown[]) => {
            values = bound;
            return { run: async () => ({ meta: { changes: 1 } }) };
          },
        };
      },
    } as unknown as D1Database;
    const now = new Date("2026-09-03T00:00:00.000Z");

    expect(await refreshSession(db, "session-token", now)).toBe(true);
    expect(query).toContain("expires_at > ? AND expires_at < ?");
    expect(values).toEqual([
      new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
      await hashToken("session-token"),
      now.toISOString(),
      new Date(now.getTime() + (SESSION_MAX_AGE_SECONDS - 86400) * 1000).toISOString(),
    ]);
  });
  it("無効化されたユーザーをsession認証の対象外にする", async () => {
    let query = "";
    const db = {
      prepare: (sql: string) => {
        query = sql;
        return { bind: () => ({ first: async () => null }) };
      },
    } as unknown as D1Database;

    expect(await getCurrentUser(db, "session-token", false)).toBeNull();
    expect(query).toContain("u.is_active = 1");
  });
  it("LINE公式アカウントの友だち状態を取得する", async () => {
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.line.me/friendship/v1/status");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer access-token");
      return Response.json({ friendFlag: true });
    };
    expect(await getLineFriendship("access-token", fetcher as typeof fetch)).toBe(true);
  });
  it("友だち状態を取得できない場合はnullを返す", async () => {
    const fetcher = async () => new Response(null, { status: 503 });
    expect(await getLineFriendship("access-token", fetcher as typeof fetch)).toBeNull();
    const rejectedFetcher = async () => {
      throw new Error("network error");
    };
    expect(await getLineFriendship("access-token", rejectedFetcher as typeof fetch)).toBeNull();
  });
});
