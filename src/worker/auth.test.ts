import { describe, expect, it } from "vitest";
import { getLineFriendship, hashToken, pkceChallenge, randomToken, safeEqual } from "./auth";

describe("auth helpers", () => {
  it("URL-safeなtokenを生成する", () => expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/));
  it("PKCE challengeを生成する", async () => expect(await pkceChallenge("test-verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/));
  it("tokenをhash化する", async () => expect(await hashToken("token")).toHaveLength(64));
  it("文字列を比較する", () => { expect(safeEqual("abc", "abc")).toBe(true); expect(safeEqual("abc", "abd")).toBe(false); });
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
    const rejectedFetcher = async () => { throw new Error("network error"); };
    expect(await getLineFriendship("access-token", rejectedFetcher as typeof fetch)).toBeNull();
  });
});
