ALTER TABLE event_sections RENAME TO event_scenes;

ALTER TABLE posts RENAME COLUMN section_id TO scene_id;

DROP INDEX idx_sections_event;
CREATE INDEX idx_scenes_event ON event_scenes(event_id, sort_order, id);
