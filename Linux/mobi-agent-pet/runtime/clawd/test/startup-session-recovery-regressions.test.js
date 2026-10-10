"use strict";

const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const themeLoader = require("../src/theme-loader");
const {
  getLeaseFilePath,
  readLeaseFile,
  updateRecoveryLeaseFromStateBody,
} = require("../hooks/session-recovery-lease");
const { restoreSessionsFromRecoveryLeases } = require("../src/session-recovery-loader");
const { handleStatePost } = require("../src/server-route-state");

themeLoader.init(path.join(__dirname, "..", "src"));
const defaultTheme = themeLoader.loadTheme("clawd");

function makeState(overrides = {}) {
  return require("../src/state")({
    lang: "en",
    theme: defaultTheme,
    t: (key) => key,
    doNotDisturb: false,
    miniTransitioning: false,
    miniMode: false,
    mouseOverPet: false,
    idlePaused: false,
    forceEyeResend: false,
    mouseStillSince: Date.now(),
    miniSleepPeeked: false,
    playSound: () => {},
    sendToRenderer: () => {},
    syncHitWin: () => {},
    sendToHitWin: () => {},
    miniPeekIn: () => {},
    miniPeekOut: () => {},
    buildContextMenu: () => {},
    buildTrayMenu: () => {},
    pendingPermissions: [],
    resolvePermissionEntry: () => {},
    dismissPermissionsForDnd: () => {},
    focusTerminalWindow: () => {},
    processKill: () => true,
    getCursorScreenPoint: () => ({ x: 100, y: 100 }),
    ...overrides,
  });
}

function postHook(state, body, remoteProfile = null) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    const res = {
      statusCode: null,
      writeHead(statusCode) { this.statusCode = statusCode; },
      end() { resolve(this.statusCode); },
    };
    handleStatePost(req, res, {
      ctx: {
        ...state,
        STATE_SVGS: { thinking: "x.svg", working: "x.svg", idle: "x.svg", sleeping: "x.svg" },
        pendingPermissions: [],
        isAgentEnabled: () => true,
      },
      createRequestHookRecorder: () => ({
        acceptedUnlessDnd() {}, droppedByDisabled() {}, droppedByDnd() {}, droppedInvalidAgent() {},
      }),
      shouldDropForDnd: () => false,
      codexOfficialTurns: new Map(),
      isWinHost: false,
      remoteProfile,
    });
    req.emit("data", Buffer.from(JSON.stringify(body)));
    req.emit("end");
  });
}

function leaseBody(overrides = {}) {
  return {
    agent_id: "claude-code",
    session_id: "real-session-1",
    event: "UserPromptSubmit",
    state: "thinking",
    agent_pid: process.pid,
    source_pid: process.pid,
    cwd: "C:/work/project",
    session_title: "Explicit task title",
    ...overrides,
  };
}

function leaseOptions(recoveryDir, eventAt, platform = "win32") {
  return {
    recoveryDir,
    eventAt,
    platform,
    getProcessStartIdentities: (pids) => new Map(
      pids.filter(Boolean).map((pid) => [pid, `${platform}:test-${pid}`]),
    ),
  };
}

describe("startup session recovery regressions", () => {
  let state;
  let recoveryDir;

  afterEach(() => {
    if (state) state.cleanup();
    state = null;
    if (recoveryDir) fs.rmSync(recoveryDir, { recursive: true, force: true });
    recoveryDir = null;
  });

  for (const platform of ["linux", "darwin", "win32"]) {
    for (const hookFirst of [false, true]) {
      it(`${platform}: keeps one session when ${hookFirst ? "HTTP hook precedes recovery" : "recovery precedes HTTP hook"}`, async () => {
        state = makeState({ focusHostPlatform: platform, resolveRecoveredClaudeFocus: () => null });
        recoveryDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawd-recovery-identity-"));
        const cwd = platform === "win32" ? "C:/work/project" : "/work/project";
        const body = leaseBody({ cwd, platform });
        const eventAt = Date.now() - 1000;
        const options = leaseOptions(recoveryDir, eventAt, platform);
        assert.strictEqual(updateRecoveryLeaseFromStateBody(body, options).written, true);

        if (hookFirst) assert.strictEqual(await postHook(state, body), 200);
        const restored = restoreSessionsFromRecoveryLeases(state, {
          ...options, now: eventAt + 500, processKill: () => true,
        });
        assert.strictEqual(restored.length, hookFirst ? 0 : 1);
        if (!hookFirst) assert.strictEqual(await postHook(state, body), 200);

        const entries = state.buildSessionSnapshot().sessions;
        assert.strictEqual(entries.length, 1);
        assert.strictEqual(entries[0].startupRecovered, false);
        assert.strictEqual(entries[0].state, "thinking");
        assert.strictEqual(entries[0].cwd, cwd);
        assert.strictEqual(state.sessions.size, 1);
      });
    }

    it(`${platform}: preserves distinct Claude sessions sharing a process and directory`, async () => {
      state = makeState({ focusHostPlatform: platform, resolveRecoveredClaudeFocus: () => null });
      recoveryDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawd-recovery-distinct-"));
      const eventAt = Date.now() - 1000;
      const options = leaseOptions(recoveryDir, eventAt, platform);
      for (const session_id of ["conversation-a", "conversation-b"]) {
        const body = leaseBody({ session_id, platform });
        assert.strictEqual(updateRecoveryLeaseFromStateBody(body, options).written, true);
      }
      assert.strictEqual(restoreSessionsFromRecoveryLeases(state, {
        ...options, now: eventAt + 500, processKill: () => true,
      }).length, 2);
      for (const session_id of ["conversation-a", "conversation-b"]) {
        assert.strictEqual(await postHook(state, leaseBody({ session_id, platform })), 200);
      }
      const entries = state.buildSessionSnapshot().sessions;
      assert.strictEqual(entries.length, 2);
      assert.deepStrictEqual(entries.map((entry) => entry.rawSessionId).sort(), ["conversation-a", "conversation-b"]);
    });

    it(`${platform}: separates local recovery from remote profiles with the same raw id`, async () => {
      state = makeState({ focusHostPlatform: platform, resolveRecoveredClaudeFocus: () => null });
      const body = leaseBody({ platform });
      assert.strictEqual(state.restoreSessionFromLease({
        agentId: "claude-code", sessionId: body.session_id, active: true, state: "thinking",
        eventAt: Date.now() - 1000, validUntil: null, pid: process.pid, sourcePid: process.pid,
        cwd: body.cwd,
      }), true);
      assert.strictEqual(await postHook(state, body), 200);
      for (const profileId of ["remote-a", "remote-b"]) {
        assert.strictEqual(await postHook(state, body, { profileId, displayHost: "shared-host" }), 200);
      }
      const entries = state.buildSessionSnapshot().sessions;
      assert.strictEqual(entries.length, 3);
      assert.deepStrictEqual(entries.map((entry) => entry.profileId).sort(), ["local", "remote-a", "remote-b"]);
    });
  }

  it("does not evict any real session when recovery starts at capacity", () => {
    state = makeState();
    const existing = new Map();
    for (let index = 0; index < 20; index += 1) {
      const id = `live-session-${index}`;
      const session = { state: "working", startupRecovered: undefined };
      existing.set(id, session);
      state.sessions.set(id, session);
    }

    const restored = state.restoreSessionFromLease({
      version: 1,
      agentId: "claude-code",
      sessionId: "recovered-session",
      active: true,
      state: "working",
      eventAt: Date.now(),
      validUntil: null,
      pid: process.pid,
      sourcePid: process.pid,
      cwd: "C:/work/project",
      title: "Recovered task",
    });

    assert.strictEqual(restored, false);
    assert.strictEqual(state.sessions.size, 20);
    assert.strictEqual(state.sessions.has("recovered-session"), false);
    for (const [id, session] of existing) {
      assert.strictEqual(state.sessions.get(id), session, `${id} must remain untouched`);
    }
  });

  it("rejects a valid lease when the integration is enabled but not installed", () => {
    recoveryDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawd-recovery-installed-"));
    updateRecoveryLeaseFromStateBody(
      leaseBody(),
      leaseOptions(recoveryDir, 1000),
    );
    let restoreCalls = 0;
    const enabled = true;
    const installed = false;

    const restored = restoreSessionsFromRecoveryLeases({
      restoreSessionFromLease: () => { restoreCalls += 1; return true; },
    }, {
      recoveryDir,
      now: 2000,
      processKill: () => true,
      platform: "win32",
      isAgentEnabled: () => enabled && installed,
      getProcessStartIdentities: (pids) => new Map(
        pids.filter(Boolean).map((pid) => [pid, `win32:test-${pid}`]),
      ),
    });

    assert.deepStrictEqual(restored, []);
    assert.strictEqual(restoreCalls, 0);
  });

  it("never persists a title synthesized from the prompt", () => {
    recoveryDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawd-recovery-title-"));
    const body = leaseBody({ session_title: "Sensitive prompt used as fallback" });
    Object.defineProperty(body, "_sessionTitleFromPrompt", {
      value: true,
      enumerable: false,
    });

    const result = updateRecoveryLeaseFromStateBody(
      body,
      leaseOptions(recoveryDir, 1000),
    );
    const filePath = getLeaseFilePath("claude-code", "real-session-1", { recoveryDir });
    const persisted = readLeaseFile(filePath);

    assert.strictEqual(result.written, true);
    assert.strictEqual(persisted.title, null);
    assert.strictEqual(fs.readFileSync(filePath, "utf8").includes(body.session_title), false);
  });

  it("waits for the HTTP server to listen before loading recovery leases", () => {
    const mainSource = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
    const startIndex = mainSource.indexOf("startHttpServer().then((port) => {");
    const portGuardIndex = mainSource.indexOf("if (port == null) return;", startIndex);
    const restoreIndex = mainSource.indexOf("restoreSessionsFromRecoveryLeases(_state", startIndex);
    const completionIndex = mainSource.indexOf("}).catch(() => {});", startIndex);

    assert.notStrictEqual(startIndex, -1, "startup must await startHttpServer's promise");
    assert.ok(portGuardIndex > startIndex, "a failed bind must skip recovery");
    assert.ok(restoreIndex > portGuardIndex, "recovery must begin only after the server resolves");
    assert.ok(completionIndex > restoreIndex, "recovery must remain inside the resolved callback");

    const recoveryBlock = mainSource.slice(restoreIndex, completionIndex);
    assert.match(
      recoveryBlock,
      /_isAgentEnabled\(snapshot, agentId\)\s*&&\s*_isAgentIntegrationInstalled\(snapshot, agentId\)/,
      "main must require both enabled and installed integration state",
    );
  });
});
