"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { normalizeProjectPath } = require("./path-identity.cjs");

function createProjectRepository(db, { now = Date.now, createId } = {}) {
  if (!db || typeof db.prepare !== "function" || typeof db.transaction !== "function") {
    throw new TypeError("a SQLite database is required");
  }
  if (typeof createId !== "function") throw new TypeError("createId is required");

  const selectProject = db.prepare("SELECT * FROM projects WHERE id = ?");
  const selectPath = db.prepare("SELECT * FROM project_paths WHERE id = ?");
  const selectPaths = db.prepare("SELECT * FROM project_paths WHERE project_id = ? ORDER BY CASE kind WHEN 'primary' THEN 0 WHEN 'alias' THEN 1 ELSE 2 END, created_at, id");
  const selectProjects = db.prepare("SELECT * FROM projects WHERE lifecycle = ? ORDER BY updated_at DESC, id");
  const insertProject = db.prepare(
    "INSERT INTO projects(id, name, description, lifecycle, confirmation, created_source, created_at, updated_at) VALUES(?, ?, ?, 'active', ?, ?, ?, ?)"
  );
  const insertPath = db.prepare(
    "INSERT INTO project_paths(id, project_id, path, canonical_path, kind, is_available, git_root, git_remote_identity, git_branch, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const updateDetails = db.prepare(
    "UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?"
  );
  const updateConfirmation = db.prepare(
    "UPDATE projects SET name = ?, description = ?, confirmation = 'confirmed', updated_at = ? WHERE id = ?"
  );
  const updateLifecycle = db.prepare(
    "UPDATE projects SET lifecycle = ?, updated_at = ? WHERE id = ?"
  );
  const updatePathKind = db.prepare("UPDATE project_paths SET kind = ? WHERE id = ?");
  const deletePath = db.prepare("DELETE FROM project_paths WHERE id = ?");
  const updateAvailability = db.prepare("UPDATE project_paths SET is_available = ? WHERE id = ?");
  const selectActivePaths = db.prepare(
    "SELECT p.project_id AS projectId, p.canonical_path AS canonicalPath FROM project_paths p JOIN projects project ON project.id = p.project_id WHERE project.lifecycle = 'active'"
  );
  const selectGitRootProjects = db.prepare(
    "SELECT DISTINCT p.project_id AS projectId FROM project_paths p JOIN projects project ON project.id = p.project_id WHERE project.lifecycle = 'active' AND (p.git_root = ? OR p.canonical_path = ?)"
  );
  const selectGitRemoteProjects = db.prepare(
    "SELECT DISTINCT p.project_id AS projectId FROM project_paths p JOIN projects project ON project.id = p.project_id WHERE project.lifecycle = 'active' AND p.git_remote_identity = ?"
  );
  const selectPathByCanonical = db.prepare("SELECT * FROM project_paths WHERE canonical_path = ?");
  const updateWorktreeMetadata = db.prepare(
    "UPDATE project_paths SET git_root = ?, git_remote_identity = ?, git_branch = ? WHERE id = ?"
  );
  const sourcePaths = db.prepare("SELECT * FROM project_paths WHERE project_id = ?");
  const targetPathByCanonical = db.prepare("SELECT id FROM project_paths WHERE project_id = ? AND canonical_path = ?");
  const transferPath = db.prepare(
    "UPDATE project_paths SET project_id = ?, kind = CASE WHEN kind = 'primary' THEN 'alias' ELSE kind END WHERE id = ?"
  );
  const moveEvents = db.prepare("UPDATE agent_events SET project_id = ? WHERE project_id = ?");
  const moveSessions = db.prepare("UPDATE agent_sessions SET project_id = ? WHERE project_id = ?");
  const moveIntervals = db.prepare("UPDATE agent_active_intervals SET project_id = ? WHERE project_id = ?");
  const moveHumanSessions = db.prepare("UPDATE human_sessions SET project_id = ? WHERE project_id = ?");

  function timestamp() {
    return Math.trunc(now());
  }

  function mapPath(row) {
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      path: row.path,
      canonicalPath: row.canonical_path,
      kind: row.kind,
      isAvailable: Boolean(row.is_available),
      gitRoot: row.git_root,
      gitRemoteIdentity: row.git_remote_identity,
      gitBranch: row.git_branch,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function mapProject(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      lifecycle: row.lifecycle,
      confirmation: row.confirmation,
      createdSource: row.created_source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      paths: selectPaths.all(row.id).map(mapPath),
    };
  }

  function get(id) {
    return mapProject(selectProject.get(id));
  }

  function expectedDomainError(domain, code, message) {
    const error = new Error(message);
    error.agentLogDomain = domain;
    error.code = code;
    return error;
  }

  function requireProject(id) {
    const project = get(id);
    if (!project) throw expectedDomainError("PROJECT_NOT_FOUND", "NOT_FOUND", "project not found");
    return project;
  }

  function requirePath(projectId, pathId) {
    const projectPath = selectPath.get(pathId);
    if (!projectPath || projectPath.project_id !== projectId) {
      throw expectedDomainError("PROJECT_PATH_NOT_FOUND", "NOT_FOUND", "project path not found");
    }
    return projectPath;
  }

  function detailsFor(existing, input = {}) {
    return {
      name: input.name === undefined ? existing.name : input.name,
      description: input.description === undefined ? existing.description : input.description,
    };
  }

  function gitFor(input = {}) {
    const git = input.git || {};
    return {
      root: git.root ?? git.gitRoot ?? null,
      remoteIdentity: git.remoteIdentity ?? git.gitRemoteIdentity ?? null,
      branch: git.branch ?? git.gitBranch ?? null,
    };
  }

  function createProject(input, confirmation, createdSource) {
    const identity = normalizeProjectPath(input.path);
    const git = gitFor(input);
    const projectId = createId();
    const pathId = createId();
    const at = timestamp();
    insertProject.run(
      projectId,
      input.name,
      input.description || "",
      confirmation,
      createdSource,
      at,
      at
    );
    insertPath.run(
      pathId,
      projectId,
      identity.path,
      identity.canonicalPath,
      "primary",
      Number(identity.isAvailable),
      git.root,
      git.remoteIdentity,
      git.branch,
      at,
      at
    );
    return get(projectId);
  }

  const createManual = db.transaction((input) => createProject(input, "confirmed", "manual"));
  const createPending = db.transaction((input) => createProject(input, "pending", "agent"));

  const update = db.transaction((id, input = {}) => {
    const project = requireProject(id);
    const details = detailsFor(project, input);
    updateDetails.run(details.name, details.description, timestamp(), id);
    return get(id);
  });

  const confirm = db.transaction((id, input = {}) => {
    const project = requireProject(id);
    const details = detailsFor(project, input);
    updateConfirmation.run(details.name, details.description, timestamp(), id);
    return get(id);
  });

  const archive = db.transaction((id) => {
    requireProject(id);
    updateLifecycle.run("archived", timestamp(), id);
    return get(id);
  });

  const addPath = db.transaction((projectId, input) => {
    requireProject(projectId);
    const identity = normalizeProjectPath(input.path);
    const git = gitFor(input);
    const pathId = createId();
    const at = timestamp();
    insertPath.run(
      pathId,
      projectId,
      identity.path,
      identity.canonicalPath,
      input.kind || "alias",
      Number(identity.isAvailable),
      git.root,
      git.remoteIdentity,
      git.branch,
      at,
      at
    );
    return mapPath(selectPath.get(pathId));
  });

  const removePath = db.transaction((projectId, pathId) => {
    const projectPath = requirePath(projectId, pathId);
    if (projectPath.kind === "primary") {
      throw expectedDomainError(
        "PRIMARY_PATH_CANNOT_BE_REMOVED",
        "INVALID_OPERATION",
        "primary path cannot be removed"
      );
    }
    deletePath.run(pathId);
    return get(projectId);
  });

  const rebindPrimary = db.transaction((projectId, pathId) => {
    requireProject(projectId);
    requirePath(projectId, pathId);
    const currentPrimary = selectPaths.all(projectId).find((item) => item.kind === "primary");
    if (currentPrimary.id !== pathId) {
      updatePathKind.run("alias", currentPrimary.id);
      updatePathKind.run("primary", pathId);
    }
    return get(projectId);
  });

  const attachWorktree = db.transaction((projectId, identity, git) => {
    requireProject(projectId);
    const normalized = typeof identity === "string" ? normalizeProjectPath(identity) : identity;
    if (!normalized || typeof normalized.path !== "string" || typeof normalized.canonicalPath !== "string") {
      throw new TypeError("project path is required");
    }
    const existing = selectPathByCanonical.get(normalized.canonicalPath);
    const metadata = gitFor({ git });
    if (existing) {
      if (existing.project_id !== projectId) {
        throw expectedDomainError(
          "PROJECT_PATH_CONFLICT",
          "PROJECT_PATH_CONFLICT",
          "project path belongs to another project"
        );
      }
      updateWorktreeMetadata.run(metadata.root, metadata.remoteIdentity, metadata.branch, existing.id);
      return mapPath(selectPath.get(existing.id));
    }
    const pathId = createId();
    const at = timestamp();
    insertPath.run(
      pathId,
      projectId,
      normalized.path,
      normalized.canonicalPath,
      "worktree",
      Number(Boolean(normalized.isAvailable)),
      metadata.root,
      metadata.remoteIdentity,
      metadata.branch,
      at,
      at
    );
    return mapPath(selectPath.get(pathId));
  });

  const refreshPathAvailability = db.transaction((pathId, fsApi = fs) => {
    const projectPath = selectPath.get(pathId);
    if (!projectPath) {
      throw expectedDomainError("PROJECT_PATH_NOT_FOUND", "NOT_FOUND", "project path not found");
    }
    const identity = normalizeProjectPath(projectPath.path, fsApi);
    updateAvailability.run(Number(identity.isAvailable), pathId);
    return mapPath(selectPath.get(pathId));
  });

  const merge = db.transaction(({ sourceProjectId, targetProjectId }) => {
    if (sourceProjectId === targetProjectId) {
      throw new TypeError("source and target project ids must differ");
    }
    requireProject(sourceProjectId);
    requireProject(targetProjectId);
    for (const sourcePath of sourcePaths.all(sourceProjectId)) {
      if (targetPathByCanonical.get(targetProjectId, sourcePath.canonical_path)) {
        deletePath.run(sourcePath.id);
      } else {
        transferPath.run(targetProjectId, sourcePath.id);
      }
    }
    moveEvents.run(targetProjectId, sourceProjectId);
    moveSessions.run(targetProjectId, sourceProjectId);
    moveIntervals.run(targetProjectId, sourceProjectId);
    moveHumanSessions.run(targetProjectId, sourceProjectId);
    updateLifecycle.run("archived", timestamp(), sourceProjectId);
    return get(targetProjectId);
  });

  function findDeepestPath(input) {
    const candidate = typeof input === "string"
      ? normalizeProjectPath(input).canonicalPath
      : input.canonicalPath;
    let match = null;
    for (const item of selectActivePaths.all()) {
      const relative = path.relative(item.canonicalPath, candidate);
      const containsCandidate = relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
      if (containsCandidate && (!match || item.canonicalPath.length > match.canonicalPath.length)) {
        match = item;
      }
    }
    return match ? get(match.projectId) : null;
  }

  function findByGitIdentity(git) {
    const identity = gitFor({ git });
    if (identity.root) {
      const rootMatches = selectGitRootProjects.all(identity.root, identity.root);
      if (rootMatches.length === 1) return get(rootMatches[0].projectId);
      if (rootMatches.length > 1) return null;
    }
    if (!identity.remoteIdentity) return null;
    const remoteMatches = selectGitRemoteProjects.all(identity.remoteIdentity);
    return remoteMatches.length === 1 ? get(remoteMatches[0].projectId) : null;
  }

  function list({ includeArchived = false } = {}) {
    const lifecycle = includeArchived ? ["active", "archived"] : ["active"];
    return lifecycle.flatMap((item) => selectProjects.all(item).map(mapProject));
  }

  return {
    list,
    get,
    createManual,
    createPending,
    update,
    confirm,
    archive,
    addPath,
    removePath,
    rebindPrimary,
    merge,
    findDeepestPath,
    findByGitIdentity,
    attachWorktree,
    refreshPathAvailability,
  };
}

module.exports = { createProjectRepository };
