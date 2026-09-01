import { ulid } from "ulid";

const NOTIFICATION_DELAY_MS = 10 * 60 * 1000;

export function getNotificationScheduledFor(publishedAt: string): string {
  return new Date(new Date(publishedAt).getTime() + NOTIFICATION_DELAY_MS).toISOString();
}

export async function addPostToNotificationBatch(
  db: D1Database,
  postId: string,
  publishedAt: string,
): Promise<string> {
  const registered = await db.prepare("SELECT batch_id FROM notification_batch_posts WHERE post_id = ?").bind(postId).first<{ batch_id: string }>();
  if (registered) return registered.batch_id;

  const pending = await db.prepare(`
    SELECT id FROM notification_batches
     WHERE status = 'pending'
     ORDER BY created_at
     LIMIT 1
  `).first<{ id: string }>();
  const batchId = pending?.id ?? ulid();
  const scheduledFor = getNotificationScheduledFor(publishedAt);

  if (pending) {
    await db.batch([
      db.prepare(`
        UPDATE notification_batches
           SET scheduled_for = ?, last_error = NULL
         WHERE id = ? AND status = 'pending'
      `).bind(scheduledFor, batchId),
      db.prepare(`
        INSERT OR IGNORE INTO notification_batch_posts (batch_id, post_id, created_at)
        VALUES (?, ?, ?)
      `).bind(batchId, postId, publishedAt),
    ]);
  } else {
    await db.batch([
      db.prepare(`
        INSERT INTO notification_batches (id, status, scheduled_for, created_at)
        VALUES (?, 'pending', ?, ?)
      `).bind(batchId, scheduledFor, publishedAt),
      db.prepare(`
        INSERT INTO notification_batch_posts (batch_id, post_id, created_at)
        VALUES (?, ?, ?)
      `).bind(batchId, postId, publishedAt),
    ]);
  }

  return batchId;
}
