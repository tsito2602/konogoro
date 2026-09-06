ALTER TABLE events ADD COLUMN cover_position_x REAL NOT NULL DEFAULT 50 CHECK (cover_position_x BETWEEN 0 AND 100);
ALTER TABLE events ADD COLUMN cover_position_y REAL NOT NULL DEFAULT 50 CHECK (cover_position_y BETWEEN 0 AND 100);
