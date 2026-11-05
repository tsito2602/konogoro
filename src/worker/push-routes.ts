import { Hono } from "hono";
import { ulid } from "ulid";
import { pushEndpointInputSchema, pushSubscriptionInputSchema } from "../shared/schemas";
import type { User } from "../shared/types";
import type { LineNotificationEnv } from "./line-messaging";
import { forgetPushSubscription, pushSubject } from "./notification-cron";
import { parseVapidKey, PushDeliveryError, sendWebPush, type PushSend } from "./web-push";

type PushEnv = {
  Bindings: Cloudflare.Env & LineNotificationEnv & { VAPID_KEY?: string };
  Variables: { currentUser: User };
};

/** 通知の届け先。アプリの端末があればアプリ、なければLINE。通知を切っていればなし。 */
export const notificationChannelSql = `
  CASE
    WHEN u.notification_enabled = 0 THEN 'none'
    WHEN EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = u.id) THEN 'app'
    WHEN u.line_friend_enabled = 1 AND u.line_user_id IS NOT NULL THEN 'line'
    ELSE 'none'
  END`;

export function createPushRoutes(send: PushSend = sendWebPush) {
  const routes = new Hono<PushEnv>();

  routes.use("/push/*", async (c, next) => {
    if (!c.var.currentUser) return c.json({ error: "ログインが必要です" }, 401);
    await next();
  });

  // この端末でアプリ通知を受け取る。ボタンでオンにしたときは、通知そのものもオンにする。
  routes.post("/push/subscriptions", async (c) => {
    if (!parseVapidKey(c.env.VAPID_KEY)) return c.json({ error: "アプリ通知はまだ使えません" }, 503);
    const input = pushSubscriptionInputSchema.parse(await c.req.json());
    const now = new Date().toISOString();
    const enable = c.env.DB.prepare("UPDATE users SET notification_enabled = 1, updated_at = ? WHERE id = ?").bind(
      now,
      c.var.currentUser.id,
    );
    await c.env.DB.batch([
      c.env.DB.prepare(
        `
        INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET
          user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = excluded.updated_at
      `,
      ).bind(ulid(), c.var.currentUser.id, input.endpoint, input.keys.p256dh, input.keys.auth, now, now),
      ...(input.enable ? [enable] : []),
    ]);
    return c.body(null, 204);
  });

  routes.delete("/push/subscriptions", async (c) => {
    const input = pushEndpointInputSchema.parse(await c.req.json());
    await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
      .bind(input.endpoint, c.var.currentUser.id)
      .run();
    return c.body(null, 204);
  });

  // オンにした直後に、この端末へ試しの通知を1通送る。
  routes.post("/push/test", async (c) => {
    const keys = parseVapidKey(c.env.VAPID_KEY);
    if (!keys) return c.json({ error: "アプリ通知はまだ使えません" }, 503);
    const input = pushEndpointInputSchema.parse(await c.req.json());
    const subscription = await c.env.DB.prepare(
      "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint = ? AND user_id = ?",
    )
      .bind(input.endpoint, c.var.currentUser.id)
      .first<{ id: string; endpoint: string; p256dh: string; auth: string }>();
    if (!subscription) return c.json({ error: "この端末の通知が見つかりません" }, 404);
    try {
      await send({
        subscription,
        message: {
          title: "このごろ",
          body: "通知が届きました。新しい思い出が届くと、このようにお知らせします。",
          url: "/",
          tag: "test",
        },
        keys,
        subject: pushSubject(c.env),
      });
    } catch (error) {
      if (error instanceof PushDeliveryError && error.gone) {
        await forgetPushSubscription(c.env.DB, subscription.id);
        return c.json({ error: "この端末の通知が切れていました。もう一度オンにしてください" }, 410);
      }
      console.error({ event: "push_test_failed", status: error instanceof PushDeliveryError ? error.status : null });
      return c.json({ error: "試しの通知を送れませんでした" }, 502);
    }
    return c.body(null, 204);
  });

  return routes;
}
