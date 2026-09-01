PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'uploader', 'viewer')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  end_date TEXT,
  cover_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  cover_object_key TEXT,
  cover_source TEXT NOT NULL DEFAULT 'auto' CHECK (cover_source IN ('auto', 'manual')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE event_sections (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (event_id, id)
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  section_id TEXT,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  caption TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  captured_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (section_id IS NULL OR event_id IS NOT NULL),
  FOREIGN KEY (event_id, section_id) REFERENCES event_sections(event_id, id) ON DELETE RESTRICT
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'failed')),
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  original_object_key TEXT NOT NULL UNIQUE,
  preview_object_key TEXT UNIQUE,
  thumbnail_object_key TEXT UNIQUE,
  byte_size INTEGER CHECK (byte_size IS NULL OR byte_size >= 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  captured_at TEXT,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  uploaded_at TEXT,
  UNIQUE (post_id, position)
);

CREATE INDEX idx_posts_timeline ON posts(status, captured_at DESC, id DESC);
CREATE INDEX idx_posts_event ON posts(event_id, status, captured_at DESC);
CREATE INDEX idx_sections_event ON event_sections(event_id, sort_order, id);
CREATE INDEX idx_media_post ON media(post_id, position);
CREATE INDEX idx_media_status ON media(status, created_at);

-- Phase 1専用。LINE Login導入時に実ユーザーへ置き換える。
INSERT INTO users (id, display_name, role, created_at, updated_at)
VALUES ('01JDEVUSER0000000000000000', 'つばさ', 'owner', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
