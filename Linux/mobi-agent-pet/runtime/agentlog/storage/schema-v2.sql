ALTER TABLE agent_sessions ADD COLUMN project_assignment_source TEXT NOT NULL DEFAULT 'automatic' CHECK (project_assignment_source IN ('automatic', 'manual'));
