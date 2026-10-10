ALTER TABLE providers ADD COLUMN universal_source_id TEXT REFERENCES providers(id) ON DELETE CASCADE;
CREATE INDEX providers_universal_source ON providers(universal_source_id);
