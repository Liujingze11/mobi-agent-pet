"use strict";

const path = require("node:path");
const { inspectGit: inspectGitDefault } = require("./git-inspector.cjs");
const { normalizeProjectPath } = require("./path-identity.cjs");

function emptyGit() {
  return { gitRoot: null, remoteIdentity: null, branch: null, isWorktree: null };
}

function pendingInput(identity, git) {
  return {
    name: path.basename(identity.canonicalPath) || identity.canonicalPath,
    path: identity.path,
    git,
  };
}

function createProjectResolver({
  repository,
  inspectGit = inspectGitDefault,
  pathIdentity = normalizeProjectPath,
} = {}) {
  if (!repository) throw new TypeError("project repository is required");
  if (typeof inspectGit !== "function") throw new TypeError("inspectGit must be a function");
  if (typeof pathIdentity !== "function") throw new TypeError("pathIdentity must be a function");

  const inspectionCache = new Map();

  function getCachedGit(canonicalPath) {
    if (!inspectionCache.has(canonicalPath)) {
      let git = emptyGit();
      try {
        git = { ...git, ...(inspectGit(canonicalPath) || {}) };
      } catch {}
      inspectionCache.set(canonicalPath, git);
    }
    return inspectionCache.get(canonicalPath);
  }

  function resolve({ cwd } = {}) {
    if (!cwd) return { project: null, path: null, created: false };
    const identity = pathIdentity(cwd);
    const direct = repository.findDeepestPath(identity.canonicalPath);
    if (direct) return { project: direct, path: identity, created: false };

    const git = getCachedGit(identity.canonicalPath);
    const related = repository.findByGitIdentity(git);
    if (related) {
      return {
        project: related,
        path: repository.attachWorktree(related.id, identity, git),
        created: false,
      };
    }
    return {
      project: repository.createPending(pendingInput(identity, git)),
      path: identity,
      created: true,
    };
  }

  return { resolve };
}

module.exports = { createProjectResolver };
