"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  closeAgentLogDatabase,
  openAgentLogDatabase,
} = require("../../runtime/agentlog/storage/database.cjs");
const { inspectGit, normalizeRemoteIdentity } = require("../../runtime/agentlog/projects/git-inspector.cjs");
const { normalizeProjectPath } = require("../../runtime/agentlog/projects/path-identity.cjs");
const { createProjectRepository } = require("../../runtime/agentlog/projects/project-repository.cjs");
const { createProjectResolver } = require("../../runtime/agentlog/projects/project-resolver.cjs");

function createHarness(t, options = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-project-resolver-"));
  const db = openAgentLogDatabase({ databasePath: path.join(tmp, "agentlog.db") });
  let nextId = 0;
  const repository = createProjectRepository(db, {
    now: () => 1_800_000_000_000,
    createId: () => `id-${++nextId}`,
  });
  const resolver = createProjectResolver({
    repository,
    inspectGit: options.inspectGit,
    pathIdentity: options.pathIdentity,
  });
  t.after(() => {
    closeAgentLogDatabase(db);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  return { db, repository, resolver, tmp };
}

function makeDirectory(parent, name) {
  const directory = path.join(parent, name);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function git(cwd, args) {
  childProcess.execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });
}

function makeGitRepository(parent, name, remote) {
  const directory = makeDirectory(parent, name);
  git(directory, ["init"]);
  git(directory, ["config", "user.name", "AgentLog Test"]);
  git(directory, ["config", "user.email", "agentlog@example.test"]);
  fs.writeFileSync(path.join(directory, "README.md"), "test\n");
  git(directory, ["add", "README.md"]);
  git(directory, ["commit", "-m", "initial"]);
  git(directory, ["remote", "add", "origin", remote]);
  return directory;
}

test("normalizes equivalent HTTPS and SSH remotes to one identity", () => {
  assert.equal(normalizeRemoteIdentity("https://GitHub.COM/example/Resolver.git"), "github.com/example/Resolver");
  assert.equal(normalizeRemoteIdentity("git@github.com:example/Resolver.git"), "github.com/example/Resolver");
  assert.equal(normalizeRemoteIdentity("ssh://git@GITHUB.com/example/Resolver.git"), "github.com/example/Resolver");
  assert.equal(normalizeRemoteIdentity("not a remote"), null);
});

test("inspects a real Git worktree with normalized origin metadata", (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-git-inspector-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repository = makeGitRepository(tmp, "repository", "git@GitHub.COM:example/Resolver.git");
  const worktree = path.join(tmp, "worktree");
  git(repository, ["worktree", "add", "-b", "feature", worktree]);
  const nested = makeDirectory(worktree, "nested");

  const metadata = inspectGit(nested);

  assert.deepEqual(metadata, {
    gitRoot: fs.realpathSync(worktree),
    remoteIdentity: "github.com/example/Resolver",
    branch: "feature",
    isWorktree: true,
  });
});

test("returns null Git metadata when bounded Git inspection fails", () => {
  const calls = [];
  const metadata = inspectGit("/missing", {
    spawnSync(command, args, options) {
      calls.push({ command, args, options });
      return { status: null, stdout: "", error: new Error("ETIMEDOUT") };
    },
  });

  assert.deepEqual(metadata, {
    gitRoot: null,
    remoteIdentity: null,
    branch: null,
    isWorktree: null,
  });
  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.equal(call.command, "git");
    assert.deepEqual(call.options, {
      encoding: "utf8",
      timeout: 250,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    });
    assert.deepEqual(call.args.slice(0, 2), ["-C", "/missing"]);
  }
});

test("chooses the deepest configured path before Git identity inspection", (t) => {
  let inspections = 0;
  const { repository, resolver, tmp } = createHarness(t, {
    inspectGit() {
      inspections += 1;
      throw new Error("configured paths must not invoke Git");
    },
  });
  const workspace = makeDirectory(tmp, "workspace");
  const packageDir = makeDirectory(workspace, "packages/app");
  const root = repository.createManual({ name: "Root", path: workspace });
  const nested = repository.createManual({ name: "Nested", path: packageDir });

  const resolution = resolver.resolve({ cwd: makeDirectory(packageDir, "src") });

  assert.equal(resolution.project.id, nested.id);
  assert.notEqual(nested.id, root.id);
  assert.equal(resolution.path.canonicalPath, fs.realpathSync(path.join(packageDir, "src")));
  assert.equal(resolution.created, false);
  assert.equal(inspections, 0);
});

test("matches a Git remote and records a real worktree path", (t) => {
  const { repository, resolver, tmp } = createHarness(t);
  const primary = makeGitRepository(tmp, "primary", "https://GitHub.com/example/Resolver.git");
  const worktree = path.join(tmp, "worktree");
  git(primary, ["worktree", "add", "-b", "feature", worktree]);
  const primaryGit = inspectGit(primary);
  const project = repository.createManual({ name: "Resolver", path: primary, git: primaryGit });

  const resolution = resolver.resolve({ cwd: makeDirectory(worktree, "src") });

  assert.equal(resolution.project.id, project.id);
  assert.equal(resolution.created, false);
  assert.equal(resolution.path.kind, "worktree");
  assert.equal(resolution.path.canonicalPath, fs.realpathSync(path.join(worktree, "src")));
  assert.equal(resolution.path.gitRemoteIdentity, "github.com/example/Resolver");
  assert.equal(resolution.path.gitBranch, "feature");
  assert.equal(repository.get(project.id).paths.filter((item) => item.kind === "worktree").length, 1);
});

test("caches Git inspection by canonical directory", (t) => {
  let inspections = 0;
  const { resolver, tmp } = createHarness(t, {
    inspectGit() {
      inspections += 1;
      return { gitRoot: null, remoteIdentity: null, branch: null, isWorktree: false };
    },
  });
  const directory = makeDirectory(tmp, "unknown");

  resolver.resolve({ cwd: directory });
  resolver.resolve({ cwd: directory });

  assert.equal(inspections, 1);
});

test("creates one pending project and reuses it for later unknown-directory events", (t) => {
  const { resolver, tmp } = createHarness(t);
  const unknown = makeDirectory(tmp, "unknown");

  const first = resolver.resolve({ cwd: unknown });
  const second = resolver.resolve({ cwd: path.join(unknown, "src") });

  assert.equal(first.created, true);
  assert.equal(first.project.confirmation, "pending");
  assert.equal(first.project.createdSource, "agent");
  assert.equal(second.project.id, first.project.id);
  assert.equal(second.created, false);
});

test("creates a pending project from an unavailable path without Git metadata", (t) => {
  const { resolver, tmp } = createHarness(t);
  const unavailable = path.join(tmp, "missing/project");

  const resolution = resolver.resolve({ cwd: unavailable });

  assert.equal(resolution.created, true);
  assert.equal(resolution.project.paths[0].path, unavailable);
  assert.equal(resolution.project.paths[0].isAvailable, false);
  assert.equal(resolution.project.paths[0].gitRoot, null);
  assert.equal(resolution.project.paths[0].gitRemoteIdentity, null);
});

test("returns an empty resolution when cwd is absent", (t) => {
  const { resolver } = createHarness(t);

  assert.deepEqual(resolver.resolve({}), { project: null, path: null, created: false });
});
