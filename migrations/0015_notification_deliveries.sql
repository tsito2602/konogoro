-- Old batches lack per-recipient receipts. Preserve ambiguous pending batches
-- for investigation and exclude them from the legacy cron without replaying.
CREATE TABLE notification_legacy_holds AS
SELECT *, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS held_at
FROM notification_batches WHERE status = 'pending';
UPDATE notification_batches
SET status = 'sent', last_error = 'legacy_delivery_unknown: automatic replay disabled; see notification_legacy_holds'
WHERE status = 'pending';

CREATE TABLE notification_dispatches (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('collecting', 'sending', 'completed')),
  scheduled_for TEXT NOT NULL,
  created_at TEXT NOT NULL,
  seal_token TEXT,
  post_count INTEGER,
  photo_count INTEGER,
  video_count INTEGER,
  message_text TEXT,
  completed_at TEXT
);
CREATE INDEX idx_notification_dispatches_due ON notification_dispatches(state, scheduled_for);
CREATE UNIQUE INDEX idx_notification_dispatches_collecting
ON notification_dispatches(state) WHERE state = 'collecting';

CREATE TABLE notification_dispatch_posts (
  batch_id TEXT NOT NULL REFERENCES notification_dispatches(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (batch_id, post_id),
  UNIQUE (post_id)
);

CREATE TABLE notification_deliveries (
  batch_id TEXT NOT NULL REFERENCES notification_dispatches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line_user_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'accepted', 'failed', 'expired', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT,
  next_attempt_at TEXT NOT NULL,
  lease_token TEXT,
  lease_until TEXT,
  accepted_at TEXT,
  last_error TEXT,
  PRIMARY KEY (batch_id, user_id)
);
