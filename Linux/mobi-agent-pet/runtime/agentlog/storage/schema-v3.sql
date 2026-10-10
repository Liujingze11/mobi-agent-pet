CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL CHECK (app_id IN ('claude','codex','gemini','grokbuild','claude-desktop','opencode','openclaw','hermes','pi','mcode','universal')),
  name TEXT NOT NULL,
  preset_id TEXT,
  activation TEXT NOT NULL CHECK (activation IN ('available','unavailable')),
  unavailable_reason TEXT,
  config_cipher BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX providers_app_order ON providers(app_id, updated_at DESC, id);
