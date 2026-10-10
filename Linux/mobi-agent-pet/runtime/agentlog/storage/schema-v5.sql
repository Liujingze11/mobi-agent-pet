CREATE TABLE provider_active (
  app_id TEXT PRIMARY KEY,
  provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
  last_hashes_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
CREATE TABLE provider_enabled (
  app_id TEXT NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  PRIMARY KEY (app_id, provider_id)
);
CREATE TABLE provider_file_transactions (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  entries_cipher BLOB NOT NULL,
  started_at INTEGER NOT NULL
);
CREATE TABLE provider_originals (
  app_id TEXT PRIMARY KEY,
  config_cipher BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
