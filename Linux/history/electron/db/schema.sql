-- ============================================================
-- DevPulse AI — Database Schema v1.0
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT,
  avatar_path TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS companies (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_companies (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  company_id    TEXT REFERENCES companies(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  color         TEXT DEFAULT '#6366f1',
  source_folder TEXT,
  total_seconds INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id     TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'todo',
  priority      INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  total_seconds INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS learning_categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  icon        TEXT DEFAULT '📚',
  color       TEXT DEFAULT '#22c55e',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS learning_topics (
  id            TEXT PRIMARY KEY,
  category_id   TEXT NOT NULL REFERENCES learning_categories(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  total_seconds INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS work_sessions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  project_id        TEXT NOT NULL REFERENCES projects(id),
  task_id           TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  start_time        TEXT NOT NULL,
  end_time          TEXT,
  paused_seconds    INTEGER NOT NULL DEFAULT 0,
  effective_seconds INTEGER,
  raw_notes         TEXT,
  completed_work    TEXT,
  problems          TEXT,
  solutions         TEXT,
  next_steps        TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS learning_sessions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  topic_id          TEXT NOT NULL REFERENCES learning_topics(id),
  start_time        TEXT NOT NULL,
  end_time          TEXT,
  paused_seconds    INTEGER NOT NULL DEFAULT 0,
  effective_seconds INTEGER,
  raw_notes         TEXT,
  learning_content  TEXT,
  gains             TEXT,
  questions         TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_summaries (
  id                TEXT PRIMARY KEY,
  session_type      TEXT NOT NULL,
  session_id        TEXT NOT NULL,
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  summary_json      TEXT NOT NULL,
  raw_response      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_reports (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  date             TEXT NOT NULL,
  content_json     TEXT NOT NULL,
  work_seconds     INTEGER NOT NULL DEFAULT 0,
  learning_seconds INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS weekly_reports (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  year             INTEGER NOT NULL,
  week             INTEGER NOT NULL,
  content_json     TEXT NOT NULL,
  work_seconds     INTEGER NOT NULL DEFAULT 0,
  learning_seconds INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, year, week)
);

CREATE TABLE IF NOT EXISTS monthly_reports (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  year             INTEGER NOT NULL,
  month            INTEGER NOT NULL,
  content_json     TEXT NOT NULL,
  work_seconds     INTEGER NOT NULL DEFAULT 0,
  learning_seconds INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, year, month)
);

CREATE TABLE IF NOT EXISTS achievements (
  id            TEXT PRIMARY KEY,
  key           TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  icon          TEXT DEFAULT '🏆',
  category      TEXT NOT NULL DEFAULT 'general',
  condition_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  achievement_id  TEXT NOT NULL REFERENCES achievements(id),
  unlocked_at     TEXT NOT NULL DEFAULT (datetime('now')),
  notified        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tags (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#94a3b8'
);

CREATE TABLE IF NOT EXISTS work_session_tags (
  session_id TEXT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, tag_id)
);

CREATE TABLE IF NOT EXISTS learning_session_tags (
  session_id TEXT NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, tag_id)
);

CREATE TABLE IF NOT EXISTS pulsecore_snapshot (
  id                        TEXT PRIMARY KEY,
  user_id                   TEXT NOT NULL REFERENCES users(id),
  state                     TEXT NOT NULL,
  session_type              TEXT,
  session_id                TEXT,
  project_id                TEXT,
  task_id                   TEXT,
  topic_id                  TEXT,
  start_time                TEXT,
  paused_at                 TEXT,
  accumulated_pause_seconds INTEGER DEFAULT 0,
  saved_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_work_sessions_user ON work_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_project ON work_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_date ON work_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_user ON learning_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_topic ON learning_sessions(topic_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_date ON learning_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_reports(user_id, date);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
