import { ulid } from "ulid";

const NOTIFICATION_DELAY_MS = 10 * 60 * 1000;

export function getNotificationScheduledFor(publishedAt: string): string {
  return new Date(new Date(publishedAt).getTime() + NOTIFICATION_DELAY_MS).toISOString();
}

export async function addPostToNotificationBatch(db: D1Database, postId: string, publishedAt: string): Promise<string> {
  const scheduledFor = getNotificationScheduledFor(publishedAt);
  // Serialize publication with sealing. Never add posts to a sending dispatch.
  await db.batch([
    db
      .prepare(
        `
      INSERT INTO notification_dispatches (id, state, scheduled_for, created_at)
      SELECT ?, 'collecting', ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM notification_dispatches WHERE state = 'collecting')
        AND NOT EXISTS (SELECT 1 FROM notification_dispatch_posts WHERE post_id = ?)
        AND NOT EXISTS (SELECT 1 FROM notification_batch_posts WHERE post_id = ?)
    `,
      )
      .bind(ulid(), scheduledFor, publishedAt, postId, postId),
    db
      .prepare(
        `
      INSERT OR IGNORE INTO notification_dispatch_posts (batch_id, post_id, created_at)
      SELECT id, ?, ? FROM notification_dispatches
      WHERE state = 'collecting'
        AND NOT EXISTS (SELECT 1 FROM notification_batch_posts WHERE post_id = ?)
    `,
      )
      .bind(postId, publishedAt, postId),
    db
      .prepare(
        `
      UPDATE notification_dispatches SET scheduled_for = MAX(scheduled_for, ?)
      WHERE state = 'collecting' AND id IN (
        SELECT batch_id FROM notification_dispatch_posts WHERE post_id = ?
      )
    `,
      )
      .bind(scheduledFor, postId),
  ]);
  const registered = await db
    .prepare(
      `
    SELECT batch_id FROM notification_dispatch_posts WHERE post_id = ?
    UNION ALL SELECT batch_id FROM notification_batch_posts WHERE post_id = ? LIMIT 1
  `,
    )
    .bind(postId, postId)
    .first<{ batch_id: string }>();
  if (!registered) throw new Error("Notification registration failed");
  return registered.batch_id;
}
