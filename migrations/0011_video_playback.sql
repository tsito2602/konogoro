-- Optional prepared rendition; legacy rows retain original playback.
ALTER TABLE media ADD COLUMN original_sha256 TEXT;
ALTER TABLE media ADD COLUMN playback_object_key TEXT;
ALTER TABLE media ADD COLUMN playback_status TEXT CHECK (playback_status IN ('pending', 'ready'));
ALTER TABLE media ADD COLUMN playback_byte_size INTEGER;
ALTER TABLE media ADD COLUMN playback_sha256 TEXT;
