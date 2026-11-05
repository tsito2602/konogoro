import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { User } from "../shared/types";
import { createPushRoutes } from "./push-routes";
import type { PushSend } from "./web-push";

function request(user: User, send: PushSend, path: string, init: RequestInit, queries: string[] = []) {
  const app = new Hono<{ Variables: { currentUser: User } }>();
  app.use("*", async (c, next) => {
    c.set("currentUser", user);
    await next();
  });
  app.route("/", createPushRoutes(send));
  const db = {
    prepare: (query: string) => ({
      bind: (...values: unknown[]) => {
        queries.push(`${query} ${JSON.stringify(values)}`);
        return {
          first: async () =>
            query.includes("FROM users")
              ? { id: "parent", line_user_id: null, line_friend_enabled: 0, notification_enabled: 1 }
              : null,
          all: async () => ({
            results: [{ id: "s1", endpoint: "https://push.example.com/1", p256dh: "k", auth: "a" }],
          }),
          run: async () => ({}),
        };
      },
    }),
  } as unknown as D1Database;
  const pair = crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
  ]) as Promise<CryptoKeyPair>;
  return pair.then(async ({ privateKey }) =>
    app.request(path, init, { DB: db, VAPID_KEY: JSON.stringify(await crypto.subtle.exportKey("jwk", privateKey)) }),
  );
}

describe("push routes", () => {
  it("試しのお知らせは管理者だけが家族へ送れる", async () => {
    const send = vi.fn<PushSend>(async () => {});
    const viewer = await request(
      { id: "v", displayName: "v", role: "viewer" },
      send,
      "/family/members/parent/test-notification",
      {
        method: "POST",
      },
    );
    expect(viewer.status).toBe(403);
    expect(send).not.toHaveBeenCalled();
    const owner = await request(
      { id: "o", displayName: "o", role: "owner" },
      send,
      "/family/members/parent/test-notification",
      {
        method: "POST",
      },
    );
    expect(await owner.json()).toEqual({ sentTo: "app" });
    expect(send).toHaveBeenCalledOnce();
  });

  it("端末の登録を消すときは自分の登録だけを消す", async () => {
    const queries: string[] = [];
    const response = await request(
      { id: "me", displayName: "me", role: "viewer" },
      vi.fn<PushSend>(),
      "/push/subscriptions",
      { method: "DELETE", body: JSON.stringify({ endpoint: "https://push.example.com/1" }) },
      queries,
    );
    expect(response.status).toBe(204);
    expect(queries).toEqual([
      'DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ? ["https://push.example.com/1","me"]',
    ]);
  });
});
