-- アプリ（PWA）の通知を受け取る端末。1人が複数の端末を持てる。
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_success_at TEXT
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

-- 届け先（LINEかアプリか）を宛先ごとに持つ。アプリだけの人は LINE のIDを持たないことがある。
PRAGMA defer_foreign_keys = true;

CREATE TABLE notification_deliveries_next (
  batch_id TEXT NOT NULL REFERENCES notification_dispatches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'line' CHECK (channel IN ('line', 'push')),
  line_user_id TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'accepted', 'failed', 'expired', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT,
  next_attempt_at TEXT NOT NULL,
  lease_token TEXT,
  lease_until TEXT,
  accepted_at TEXT,
  last_error TEXT,
  PRIMARY KEY (batch_id, user_id),
  CHECK (channel = 'push' OR line_user_id IS NOT NULL)
);

INSERT INTO notification_deliveries_next (
  batch_id, user_id, channel, line_user_id, state, attempts, first_attempt_at, next_attempt_at,
  lease_token, lease_until, accepted_at, last_error
)
SELECT batch_id, user_id, 'line', line_user_id, state, attempts, first_attempt_at, next_attempt_at,
  lease_token, lease_until, accepted_at, last_error
FROM notification_deliveries;

DROP TABLE notification_deliveries;
ALTER TABLE notification_deliveries_next RENAME TO notification_deliveries;
