ALTER TABLE providers ADD COLUMN sort_index INTEGER NOT NULL DEFAULT 0;
CREATE INDEX providers_manual_order ON providers(app_id, sort_index, updated_at DESC, id);
