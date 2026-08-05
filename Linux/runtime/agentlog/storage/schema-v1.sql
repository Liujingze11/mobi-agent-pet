CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('active','archived')),
  confirmation TEXT NOT NULL CHECK (confirmation IN ('pending','confirmed')),
  created_source TEXT NOT NULL CHECK (created_source IN ('manual','agent')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE project_paths (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  canonical_path TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('primary','alias','worktree')),
  is_available INTEGER NOT NULL CHECK (is_available IN (0,1)),
  git_root TEXT,
  git_remote_identity TEXT,
  git_branch TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX project_paths_active_canonical ON project_paths(canonical_path);
CREATE UNIQUE INDEX project_paths_one_primary ON project_paths(project_id) WHERE kind='primary';
CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  source_session_id TEXT NOT NULL,
  parent_source_session_id TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  cwd TEXT,
  title TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  last_event_at INTEGER NOT NULL,
  latest_state TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('active','completed','errored','interrupted')),
  transcript_path TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(agent_id, source_session_id)
);
CREATE TABLE agent_events (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  source_event_id TEXT,
  source_sequence INTEGER,
  session_id TEXT NOT NULL,
  raw_session_id TEXT NOT NULL,
  parent_session_id TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  agent_session_row_id TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  cwd TEXT,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  state TEXT NOT NULL,
  tool_name TEXT,
  transcript_path TEXT,
  permission_json TEXT,
  payload_json TEXT NOT NULL
);
CREATE INDEX agent_events_project_time ON agent_events(project_id, occurred_at DESC);
CREATE TABLE agent_active_intervals (
  id TEXT PRIMARY KEY,
  agent_session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  close_reason TEXT
);
CREATE UNIQUE INDEX agent_intervals_one_open ON agent_active_intervals(agent_session_id) WHERE ended_at IS NULL;
CREATE TABLE human_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('running','paused','completed')),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  paused_at INTEGER,
  accumulated_pause_ms INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX human_sessions_one_active ON human_sessions((1)) WHERE status IN ('running','paused');
