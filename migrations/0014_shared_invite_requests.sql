ALTER TABLE invites ADD COLUMN approval_required INTEGER NOT NULL DEFAULT 0 CHECK (approval_required IN (0, 1));
ALTER TABLE invites ADD COLUMN closed_at TEXT;

CREATE TABLE invite_requests (
  id TEXT PRIMARY KEY,
  invite_id TEXT NOT NULL REFERENCES invites(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TEXT NOT NULL,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  notification_error TEXT,
  UNIQUE (invite_id, user_id)
);

CREATE INDEX idx_invite_requests_status ON invite_requests(status, requested_at, id);
CREATE INDEX idx_invites_shared_active ON invites(approval_required, closed_at, expires_at);
