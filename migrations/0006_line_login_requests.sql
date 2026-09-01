CREATE TABLE line_login_requests (
  state_hash TEXT PRIMARY KEY,
  nonce TEXT,
  verifier TEXT,
  invite_token_hash TEXT,
  completed_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_line_login_requests_expiry ON line_login_requests(expires_at);
