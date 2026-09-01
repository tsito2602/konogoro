ALTER TABLE users ADD COLUMN line_user_id TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN notification_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notification_enabled IN (0, 1));

CREATE UNIQUE INDEX idx_users_line_user_id ON users(line_user_id) WHERE line_user_id IS NOT NULL;

ALTER TABLE media ADD COLUMN duration_seconds REAL CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_comments_post ON comments(post_id, created_at, id);

CREATE TABLE view_histories (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_viewed_at TEXT NOT NULL,
  last_viewed_at TEXT NOT NULL,
  UNIQUE (post_id, user_id)
);

CREATE INDEX idx_view_histories_post ON view_histories(post_id, first_viewed_at, id);
