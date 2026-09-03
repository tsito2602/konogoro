import { buildNotificationText, sendLineNotification } from "./line-messaging";

type NotificationBatch = {
  id: string;
  post_count: number;
  photo_count: number;
  video_count: number;
  latest_post_id: string | null;
};

type NotificationRecipient = {
  id: string;
  line_user_id: string;
};

type SendNotification = typeof sendLineNotification;

export type NotificationCronEnv = Cloudflare.Env & {
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  APP_ORIGIN?: string;
};

export async function processNotificationBatches(
  env: NotificationCronEnv,
  now = new Date(),
  send: SendNotification = sendLineNotification,
): Promise<void> {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return;

  const due = await env.DB.prepare(
    `
    SELECT b.id,
           COUNT(DISTINCT p.id) AS post_count,
           COUNT(DISTINCT CASE WHEN m.status = 'uploaded' AND m.kind = 'image' THEN m.id END) AS photo_count,
           COUNT(DISTINCT CASE WHEN m.status = 'uploaded' AND m.kind = 'video' THEN m.id END) AS video_count,
           (
             SELECT latest_bp.post_id
               FROM notification_batch_posts latest_bp
               JOIN posts latest_post ON latest_post.id = latest_bp.post_id
              WHERE latest_bp.batch_id = b.id AND latest_post.status = 'published'
              ORDER BY latest_post.published_at DESC, latest_post.id DESC
              LIMIT 1
           ) AS latest_post_id
      FROM notification_batches b
      JOIN notification_batch_posts bp ON bp.batch_id = b.id
      JOIN posts p ON p.id = bp.post_id
      LEFT JOIN media m ON m.post_id = p.id
     WHERE b.status = 'pending' AND b.scheduled_for <= ?
     GROUP BY b.id
     ORDER BY b.scheduled_for, b.id
  `,
  )
    .bind(now.toISOString())
    .all<NotificationBatch>();

  if (due.results.length === 0) return;

  const recipients = await env.DB.prepare(
    `
    SELECT id, line_user_id
      FROM users
     WHERE is_active = 1 AND notification_enabled = 1 AND line_friend_enabled = 1 AND line_user_id IS NOT NULL
     ORDER BY id
  `,
  ).all<NotificationRecipient>();

  let sentCount = 0;
  let failedCount = 0;
  for (const batch of due.results) {
    const text = buildNotificationText({
      postCount: Number(batch.post_count),
      photoCount: Number(batch.photo_count),
      videoCount: Number(batch.video_count),
      appOrigin: env.APP_ORIGIN ?? "",
      latestPostId: batch.latest_post_id,
    });
    const results = await Promise.allSettled(
      recipients.results.map(async (recipient) => {
        await send({
          channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN!,
          to: recipient.line_user_id,
          text,
          retryKey: await notificationRetryKey(batch.id, recipient.id),
        });
      }),
    );
    const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");

    if (failed) {
      const message = failed.reason instanceof Error ? failed.reason.message : String(failed.reason);
      await env.DB.prepare("UPDATE notification_batches SET last_error = ? WHERE id = ? AND status = 'pending'")
        .bind(message.slice(0, 1000), batch.id)
        .run();
      failedCount += 1;
      console.error({
        event: "notification_batch_failed",
        batchId: batch.id,
        recipientCount: recipients.results.length,
        message,
      });
      continue;
    }

    await env.DB.prepare(
      "UPDATE notification_batches SET status = 'sent', sent_at = ?, last_error = NULL WHERE id = ? AND status = 'pending'",
    )
      .bind(now.toISOString(), batch.id)
      .run();
    sentCount += 1;
  }

  console.log({
    event: "notification_cron_completed",
    dueCount: due.results.length,
    sentCount,
    failedCount,
    recipientCount: recipients.results.length,
  });
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
