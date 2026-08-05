"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

function git(cwd, args, spawn = spawnSync) {
  try {
    const result = spawn("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      timeout: 250,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    });
    return result && result.status === 0 && typeof result.stdout === "string"
      ? result.stdout.trim() || null
      : null;
  } catch {
    return null;
  }
}

function normalizeRemoteIdentity(remote) {
  if (typeof remote !== "string" || !remote.trim()) return null;
  const value = remote.trim();
  let host;
  let repositoryPath;

  let url;
  try {
    url = new URL(value);
  } catch {}
  if (url && url.host) {
    host = url.host;
    repositoryPath = url.pathname;
  } else {
    const scpStyle = value.match(/^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/);
    if (!scpStyle) return null;
    [, host, repositoryPath] = scpStyle;
  }

  const normalizedPath = repositoryPath
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "");
  return normalizedPath ? `${host.toLowerCase()}/${normalizedPath}` : null;
}

function absoluteGitPath(cwd, value) {
  return value && path.resolve(cwd, value);
}

function inspectGit(cwd, { spawnSync: spawn = spawnSync } = {}) {
  const gitRoot = git(cwd, ["rev-parse", "--show-toplevel"], spawn);
  const remote = git(cwd, ["remote", "get-url", "origin"], spawn);
  const branch = git(cwd, ["branch", "--show-current"], spawn);
  const gitDir = git(cwd, ["rev-parse", "--git-dir"], spawn);
  const commonDir = git(cwd, ["rev-parse", "--git-common-dir"], spawn);

  return {
    gitRoot,
    remoteIdentity: normalizeRemoteIdentity(remote),
    branch,
    isWorktree: gitRoot && gitDir && commonDir
      ? absoluteGitPath(cwd, gitDir) !== absoluteGitPath(cwd, commonDir)
      : null,
  };
}

module.exports = { inspectGit, normalizeRemoteIdentity };
