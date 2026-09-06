-- Restricts representative-media ranking to uploaded rows in the requested posts.
CREATE INDEX idx_media_uploaded_post_order ON media(post_id, position, id) WHERE status = 'uploaded';
