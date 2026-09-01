import { describe, expect, it } from "vitest";
import { hashToken, pkceChallenge, randomToken, safeEqual } from "./auth";

describe("auth helpers", () => {
  it("URL-safeなtokenを生成する", () => expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/));
  it("PKCE challengeを生成する", async () => expect(await pkceChallenge("test-verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/));
  it("tokenをhash化する", async () => expect(await hashToken("token")).toHaveLength(64));
  it("文字列を比較する", () => { expect(safeEqual("abc", "abc")).toBe(true); expect(safeEqual("abc", "abd")).toBe(false); });
});
