import {
  buildNotificationText,
  lineNotificationOrigin,
  LineDeliveryError,
  sendLineNotification,
  type LineNotificationEnv,
} from "./line-messaging";

export type NotificationCronEnv = Cloudflare.Env &
  LineNotificationEnv & {
    LINE_CHANNEL_ACCESS_TOKEN?: string;
    STAGING?: string;
  };
type Dispatch = {
  id: string;
  post_count: number;
  photo_count: number;
  video_count: number;
  message_text: string | null;
};
type Delivery = { user_id: string; line_user_id: string };

// Leave a safety margin inside LINE's 24-hour retry-key lifetime.
export const NOTIFICATION_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export async function processNotificationBatches(
  env: NotificationCronEnv,
  now = new Date(),
  send: typeof sendLineNotification = sendLineNotification,
): Promise<void> {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || env.STAGING === "true") return;
  const started = Date.now();
  const currentTime = () => new Date(now.getTime() + Math.max(0, Date.now() - started));
  const at = now.toISOString();
  const sealToken = crypto.randomUUID();
  // Counts and recipients are frozen atomically with sealing. A concurrent cron
  // cannot append recipients, because its seal token will not match.
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
    env.DB.prepare(
      `
      INSERT INTO notification_deliveries (batch_id, user_id, line_user_id, next_attempt_at)
      SELECT b.id, u.id, u.line_user_id, ? FROM notification_dispatches b CROSS JOIN users u
      WHERE b.seal_token = ? AND b.post_count > 0 AND u.is_active = 1
        AND u.notification_enabled = 1 AND u.line_friend_enabled = 1 AND u.line_user_id IS NOT NULL
    `,
    ).bind(at, sealToken),
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
      SELECT user_id, line_user_id FROM notification_deliveries
      WHERE batch_id = ? AND state = 'pending' AND next_attempt_at <= ?
        AND (lease_until IS NULL OR lease_until <= ?)
    `,
    )
      .bind(batch.id, at, at)
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
          channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
          to: delivery.line_user_id,
          text: payload.message_text,
          retryKey: await notificationRetryKey(batch.id, delivery.user_id),
        });
        await settle("accepted");
      } catch (error) {
        const retryable = !(error instanceof LineDeliveryError) || error.retryable;
        const reason = error instanceof LineDeliveryError ? `line_http_${error.status}` : "delivery_uncertain";
        const delay = Math.min(15 * 60_000, 60_000 * 2 ** Math.min(claimed.attempts - 1, 4));
        await settle(retryable ? "pending" : "failed", reason, new Date(currentTime().getTime() + delay).toISOString());
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
