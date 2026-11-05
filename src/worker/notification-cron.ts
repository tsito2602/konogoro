import {
  buildNotificationText,
  lineNotificationOrigin,
  LineDeliveryError,
  notificationSummary,
  sendLineNotification,
  type LineNotificationEnv,
} from "./line-messaging";
import { countUnreadPosts } from "./db";
import { parseVapidKey, PushDeliveryError, sendWebPush, type PushMessage, type PushSend } from "./web-push";

export type NotificationCronEnv = Cloudflare.Env &
  LineNotificationEnv & {
    LINE_CHANNEL_ACCESS_TOKEN?: string;
    STAGING?: string;
    /** アプリ通知の VAPID 秘密鍵（JWK の JSON）。ないときはアプリ通知を送らない。 */
    VAPID_KEY?: string;
  };
type Dispatch = {
  id: string;
  post_count: number;
  photo_count: number;
  video_count: number;
  message_text: string | null;
};
type Delivery = { user_id: string; channel: "line" | "push"; line_user_id: string | null };
type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

export function pushSubject(env: LineNotificationEnv): string {
  return lineNotificationOrigin(env) || "https://konogoro.tsito-apps.workers.dev";
}

export function newPostsPushMessage(counts: {
  postCount: number;
  photoCount: number;
  videoCount: number;
}): PushMessage {
  return {
    // iPhoneは見出しの下に「from （サイト名）」を自動で付ける。アプリ名を見出しに重ねず、中身を見出しにする。
    title: "新しい思い出が届きました",
    body: notificationSummary(counts),
    url: "/unread",
    tag: "new-posts",
  };
}

/** アプリ通知が届かなくなった端末の購読を消す。 */
export async function forgetPushSubscription(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(id).run();
}

// Leave a safety margin inside LINE's 24-hour retry-key lifetime.
export const NOTIFICATION_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export async function processNotificationBatches(
  env: NotificationCronEnv,
  now = new Date(),
  send: typeof sendLineNotification = sendLineNotification,
  push: PushSend = sendWebPush,
): Promise<void> {
  // stagingからはLINEを送らない。アプリ通知は試す人の端末にだけ届くので送る。
  const lineToken = env.STAGING === "true" ? undefined : env.LINE_CHANNEL_ACCESS_TOKEN;
  const vapid = parseVapidKey(env.VAPID_KEY);
  if (!lineToken && !vapid) return;
  const started = Date.now();
  const currentTime = () => new Date(now.getTime() + Math.max(0, Date.now() - started));
  const at = now.toISOString();
  const sealToken = crypto.randomUUID();
  // Counts and recipients are frozen atomically with sealing. A concurrent cron
  // cannot append recipients, because its seal token will not match.
  const recipients = [
    // アプリ通知を受け取れる端末がある人はアプリへ。先に入れるので、LINEの行は重ならない。
    vapid &&
      env.DB.prepare(
        `
      INSERT INTO notification_deliveries (batch_id, user_id, channel, line_user_id, next_attempt_at)
      SELECT b.id, u.id, 'push', NULL, ? FROM notification_dispatches b CROSS JOIN users u
      WHERE b.seal_token = ? AND b.post_count > 0 AND u.is_active = 1 AND u.notification_enabled = 1
        AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = u.id)
    `,
      ).bind(at, sealToken),
    lineToken &&
      env.DB.prepare(
        `
      INSERT OR IGNORE INTO notification_deliveries (batch_id, user_id, channel, line_user_id, next_attempt_at)
      SELECT b.id, u.id, 'line', u.line_user_id, ? FROM notification_dispatches b CROSS JOIN users u
      WHERE b.seal_token = ? AND b.post_count > 0 AND u.is_active = 1
        AND u.notification_enabled = 1 AND u.line_friend_enabled = 1 AND u.line_user_id IS NOT NULL
    `,
      ).bind(at, sealToken),
  ].filter((statement): statement is D1PreparedStatement => Boolean(statement));
  await env.DB.batch([
    env.DB.prepare(
      `
      UPDATE notification_dispatches SET state = 'sending', seal_token = ?,
        post_count = (SELECT COUNT(*) FROM notification_dispatch_posts bp
          JOIN posts p ON p.id = bp.post_id WHERE bp.batch_id = notification_dispatches.id AND p.status = 'published'),
        photo_count = (SELECT COUNT(*) FROM notification_dispatch_posts bp
          JOIN posts p ON p.id = bp.post_id JOIN media m ON m.post_id = p.id
          WHERE bp.batch_id = notification_dispatches.id AND p.status = 'published' AND m.status = 'uploaded' AND m.kind = 'image'),
        video_count = (SELECT COUNT(*) FROM notification_dispatch_posts bp
          JOIN posts p ON p.id = bp.post_id JOIN media m ON m.post_id = p.id
          WHERE bp.batch_id = notification_dispatches.id AND p.status = 'published' AND m.status = 'uploaded' AND m.kind = 'video')
      WHERE state = 'collecting' AND scheduled_for <= ?
    `,
    ).bind(sealToken, at),
    ...recipients,
  ]);
  const batches = await env.DB.prepare(
    "SELECT id, post_count, photo_count, video_count, message_text FROM notification_dispatches WHERE state = 'sending'",
  ).all<Dispatch>();
  for (const batch of batches.results) {
    if (batch.message_text === null) {
      const text = buildNotificationText({
        postCount: batch.post_count,
        photoCount: batch.photo_count,
        videoCount: batch.video_count,
        appOrigin: lineNotificationOrigin(env),
      });
      await env.DB.prepare("UPDATE notification_dispatches SET message_text = ? WHERE id = ? AND message_text IS NULL")
        .bind(text, batch.id)
        .run();
    }
    const payload = await env.DB.prepare("SELECT message_text FROM notification_dispatches WHERE id = ?")
      .bind(batch.id)
      .first<{ message_text: string }>();
    if (!payload) continue;
    const deliveries = await env.DB.prepare(
      `
      SELECT user_id, channel, line_user_id FROM notification_deliveries
      WHERE batch_id = ? AND state = 'pending' AND next_attempt_at <= ?
        AND (lease_until IS NULL OR lease_until <= ?)
        AND ((channel = 'line' AND ?) OR (channel = 'push' AND ?))
    `,
    )
      .bind(batch.id, at, at, lineToken ? 1 : 0, vapid ? 1 : 0)
      .all<Delivery>();
    for (const delivery of deliveries.results) {
      const attemptTime = currentTime();
      const attemptAt = attemptTime.toISOString();
      const lease = crypto.randomUUID();
      const claimed = await env.DB.prepare(
        `
        UPDATE notification_deliveries SET lease_token = ?, lease_until = ?,
          first_attempt_at = COALESCE(first_attempt_at, ?), attempts = attempts + 1
        WHERE batch_id = ? AND user_id = ? AND state = 'pending'
          AND next_attempt_at <= ? AND (lease_until IS NULL OR lease_until <= ?)
        RETURNING first_attempt_at, attempts
      `,
      )
        .bind(
          lease,
          new Date(attemptTime.getTime() + 60_000).toISOString(),
          attemptAt,
          batch.id,
          delivery.user_id,
          attemptAt,
          attemptAt,
        )
        .first<{ first_attempt_at: string; attempts: number }>();
      if (!claimed) continue;
      const settle = async (state: string, error: string | null = null, next = attemptAt) => {
        await env.DB.prepare(
          `
          UPDATE notification_deliveries SET state = ?, last_error = ?, next_attempt_at = ?,
            accepted_at = CASE WHEN ? = 'accepted' THEN ? ELSE accepted_at END,
            lease_token = NULL, lease_until = NULL
          WHERE batch_id = ? AND user_id = ? AND lease_token = ?
        `,
        )
          .bind(state, error, next, state, currentTime().toISOString(), batch.id, delivery.user_id, lease)
          .run();
      };
      if (attemptTime.getTime() - Date.parse(claimed.first_attempt_at) >= NOTIFICATION_RETRY_WINDOW_MS) {
        await settle("expired", "retry_window_expired");
        console.error({ event: "notification_delivery_expired", batchId: batch.id });
        continue;
      }
      const backoff = () =>
        new Date(
          currentTime().getTime() + Math.min(15 * 60_000, 60_000 * 2 ** Math.min(claimed.attempts - 1, 4)),
        ).toISOString();
      if (delivery.channel === "push" && vapid) {
        const active = await env.DB.prepare(
          "SELECT id FROM users WHERE id = ? AND is_active = 1 AND notification_enabled = 1",
        )
          .bind(delivery.user_id)
          .first();
        if (!active) {
          await settle("skipped");
          continue;
        }
        const subscriptions = await env.DB.prepare(
          "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ? ORDER BY created_at, id",
        )
          .bind(delivery.user_id)
          .all<Subscription>();
        const badge = await countUnreadPosts(env.DB, delivery.user_id).catch(() => undefined);
        let delivered = false;
        let retryable = false;
        let lastError = "push_no_subscription";
        for (const subscription of subscriptions.results) {
          try {
            await push({
              subscription,
              message: {
                ...newPostsPushMessage({
                  postCount: batch.post_count,
                  photoCount: batch.photo_count,
                  videoCount: batch.video_count,
                }),
                badge,
              },
              keys: vapid,
              subject: pushSubject(env),
            });
            delivered = true;
            await env.DB.prepare("UPDATE push_subscriptions SET last_success_at = ? WHERE id = ?")
              .bind(currentTime().toISOString(), subscription.id)
              .run();
          } catch (error) {
            lastError = error instanceof PushDeliveryError ? `push_http_${error.status}` : "push_uncertain";
            if (error instanceof PushDeliveryError && error.gone) await forgetPushSubscription(env.DB, subscription.id);
            else if (!(error instanceof PushDeliveryError) || error.retryable) retryable = true;
            console.error({ event: "push_delivery_failed", batchId: batch.id, reason: lastError });
          }
        }
        if (delivered) {
          await settle("accepted");
          continue;
        }
        if (retryable) {
          await settle("pending", lastError, backoff());
          continue;
        }
        // アプリに届けられない（アプリを消した、通知を切ったなど）。LINEで受け取れる人はLINEへ戻す。
        const line = lineToken
          ? await env.DB.prepare(
              "SELECT line_user_id FROM users WHERE id = ? AND line_friend_enabled = 1 AND line_user_id IS NOT NULL",
            )
              .bind(delivery.user_id)
              .first<{ line_user_id: string }>()
          : null;
        if (!line) {
          await settle("failed", lastError);
          continue;
        }
        await env.DB.prepare(
          `
          UPDATE notification_deliveries SET channel = 'line', line_user_id = ?, last_error = ?,
            next_attempt_at = ?, lease_token = NULL, lease_until = NULL
          WHERE batch_id = ? AND user_id = ? AND lease_token = ?
        `,
        )
          .bind(line.line_user_id, lastError, attemptAt, batch.id, delivery.user_id, lease)
          .run();
        console.error({ event: "push_fell_back_to_line", batchId: batch.id });
        continue;
      }
      if (delivery.channel !== "line" || !lineToken) continue;
      const eligible = await env.DB.prepare(
        `
        SELECT id FROM users WHERE id = ? AND line_user_id = ? AND is_active = 1
          AND notification_enabled = 1 AND line_friend_enabled = 1
      `,
      )
        .bind(delivery.user_id, delivery.line_user_id)
        .first();
      if (!eligible) {
        await settle("skipped");
        continue;
      }
      try {
        await send({
          channelAccessToken: lineToken,
          to: delivery.line_user_id!,
          text: payload.message_text,
          retryKey: await notificationRetryKey(batch.id, delivery.user_id),
        });
        await settle("accepted");
      } catch (error) {
        const retryable = !(error instanceof LineDeliveryError) || error.retryable;
        const reason = error instanceof LineDeliveryError ? `line_http_${error.status}` : "delivery_uncertain";
        await settle(retryable ? "pending" : "failed", reason, backoff());
        console.error({ event: "notification_delivery_failed", batchId: batch.id, reason });
      }
    }
    await env.DB.prepare(
      `
      UPDATE notification_dispatches SET state = 'completed', completed_at = ?
      WHERE id = ? AND state = 'sending' AND NOT EXISTS (
        SELECT 1 FROM notification_deliveries WHERE batch_id = ? AND state = 'pending'
      )
    `,
    )
      .bind(at, batch.id, batch.id)
      .run();
  }
}

export async function notificationRetryKey(batchId: string, userId: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${batchId}:${userId}`)),
  ).slice(0, 16);
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
