ALTER TABLE provider_enabled ADD COLUMN native_key TEXT;
UPDATE provider_enabled SET native_key = provider_id;
CREATE UNIQUE INDEX provider_enabled_native_key ON provider_enabled(app_id, native_key);
