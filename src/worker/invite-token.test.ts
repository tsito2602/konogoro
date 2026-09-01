import { describe, expect, it } from "vitest";
import { createInviteToken, hashInviteToken } from "./invite-token";

describe("invite token", () => {
  it("URLに安全なランダムtokenとSHA-256 hashを作る", async () => {
    const first = await createInviteToken();
    const second = await createInviteToken();

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).toBe(await hashInviteToken(first.token));
    expect(second.token).not.toBe(first.token);
    expect(first.tokenHash).not.toBe(first.token);
  });
});
