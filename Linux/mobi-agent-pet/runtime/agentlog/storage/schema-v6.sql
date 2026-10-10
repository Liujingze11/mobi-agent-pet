CREATE TABLE provider_balances (
  provider_id TEXT PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
  kind TEXT CHECK(kind IN ('money','quota') OR kind IS NULL),
  amount REAL,
  currency TEXT,
  remaining REAL,
  unit TEXT,
  reset_at INTEGER,
  checked_at INTEGER,
  stale INTEGER NOT NULL DEFAULT 1,
  error TEXT CHECK(error IN ('auth','network','format') OR error IS NULL)
);
