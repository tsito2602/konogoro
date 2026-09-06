CREATE TABLE multipart_uploads (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  variant TEXT NOT NULL CHECK (variant IN ('original', 'playback')),
  object_key TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 67108864 AND 524288000),
  content_type TEXT NOT NULL,
  upload_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'aborted')),
  created_at TEXT NOT NULL,
  UNIQUE (media_id, variant)
);
