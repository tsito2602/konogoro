ALTER TABLE users ADD COLUMN line_friend_enabled INTEGER NOT NULL DEFAULT 0 CHECK (line_friend_enabled IN (0, 1));
