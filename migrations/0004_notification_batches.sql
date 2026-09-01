CREATE TABLE notification_batches (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
  scheduled_for TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  last_error TEXT
);

CREATE TABLE notification_batch_posts (
  batch_id TEXT NOT NULL REFERENCES notification_batches(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (batch_id, post_id)
);

CREATE INDEX idx_notification_batches_pending
  ON notification_batches(status, scheduled_for);

CREATE UNIQUE INDEX idx_notification_batch_posts_post
  ON notification_batch_posts(post_id);
