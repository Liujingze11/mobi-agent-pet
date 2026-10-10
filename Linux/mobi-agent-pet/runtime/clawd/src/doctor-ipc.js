const os = require("os");
const path = require("path");
const { runDoctorChecks } = require("./doctor");
const { getCodexHookHealth } = require("./codex-hook-health");
const { formatDiagnosticReport, redactDoctorResult } = require("./doctor-report");
const { createConnectionTestDeduper, runConnectionTest } = require("./doctor-hook-activity");
const { openClawdLog } = require("./doctor-logs");
const { buildDoctorUserView } = require("./doctor-user-view");
const { runConversationJumpCheck } = require("./doctor-conversation-jump");
const { readProblems, recordProblem } = require("../../agentlog/problem-journal.cjs");

function getDoctorRedactionOptions(app) {
  const appRoots = [path.resolve(path.join(__dirname, ".."))];
  try {
    const appPath = app.getAppPath();
    if (appPath) appRoots.push(path.resolve(appPath));
  } catch {}
  return { appRoots };
}

function normalizeDoctorObjectPayload(payload) {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function normalizeDoctorConnectionTestPayload(payload) {
  return normalizeDoctorObjectPayload(payload);
}

function normalizeDoctorOpenLogPayload(payload) {
  const safePayload = normalizeDoctorObjectPayload(payload);
  return typeof safePayload.name === "string" ? { name: safePayload.name } : {};
}

function createDoctorRunChecksDeduper(runChecks, options = {}) {
  const onResult = typeof options.onResult === "function" ? options.onResult : null;
  let pending = null;
  return function runDedupedDoctorChecks() {
    // Single-flight: concurrent IPC calls share the first run's result.
    if (pending) return pending;
    try {
      pending = Promise.resolve(runChecks())
        .then((result) => {
          if (onResult) onResult(result);
          return result;
        })
        .finally(() => {
          pending = null;
        });
    } catch (err) {
      pending = Promise.reject(err)
        .finally(() => {
          pending = null;
        });
    }
    return pending;
  };
}

function registerDoctorIpc({
  ipcMain,
  app,
  shell,
  server,
  getPrefsSnapshot,
  getDoNotDisturb,
  getLocale,
  resolveAgentDisplayName,
  getRemoteSshStatuses,
  getAppSelfCheck,
  getLatestAgentRecords,
  getSessionSnapshot,
  focusSession,
  getConversationJumpResult,
  onConversationJumpResult,
}) {
  let lastDoctorResult = null;
  let lastDoctorConnectionTest = null;

  const runDedupedDoctorConnectionTest = createConnectionTestDeduper(
    (payload) => runConnectionTest({
      server,
      durationMs: payload && payload.durationMs,
      homeDir: os.homedir(),
      resolveAgentDisplayName,
    }),
    {
      onResult: (result) => {
        lastDoctorConnectionTest = result;
      },
    }
  );

  function buildDoctorResult() {
    const prefs = getPrefsSnapshot();
    const result = runDoctorChecks({
      server,
      prefs,
      doNotDisturb: getDoNotDisturb(),
      getRemoteSshStatuses,
    });
    const problemDir = app.getPath("userData");
    const local = result.checks.find((check) => check.id === "local-server");
    if (local && local.level) recordProblem(problemDir, "local-service");
    const integrations = result.checks.find((check) => check.id === "agent-integrations");
    for (const detail of integrations && Array.isArray(integrations.details) ? integrations.details : []) {
      if (detail && detail.level === "warning") {
        recordProblem(problemDir, "agent-connection", { agentId: detail.agentId });
      }
    }
    let features = {};
    let records = [];
    try { features = { ...(typeof getAppSelfCheck === "function" ? getAppSelfCheck() : {}) }; } catch { features = { data: "issue" }; }
    const jumpResult = typeof getConversationJumpResult === "function" ? getConversationJumpResult() : null;
    features.jump = jumpResult && jumpResult.status === "ok" ? "ok"
      : jumpResult && jumpResult.status === "failed" ? "issue" : "waiting";
    try { records = typeof getLatestAgentRecords === "function" ? getLatestAgentRecords() : []; } catch { features.data = "issue"; }
    if (features.icon === "issue") recordProblem(problemDir, "icon-unavailable");
    if (features.pet === "issue") recordProblem(problemDir, "pet-window");
    if (features.data === "issue") recordProblem(problemDir, "storage-unavailable");
    const events = server && typeof server.getRecentHookEvents === "function"
      ? server.getRecentHookEvents({ since: Date.now() - 24 * 60 * 60 * 1000 }) : [];
    result.selfCheck = buildDoctorUserView({
      checks: result.checks, events, records, features,
      customApplications: prefs.customApplications,
      agentPrefs: prefs.agents,
    });
    result.problems = readProblems(problemDir);
    lastDoctorResult = result;
    return lastDoctorResult;
  }

  function buildDoctorReportResult() {
    const result = lastDoctorResult || buildDoctorResult();
    if (!lastDoctorConnectionTest) return result;
    return {
      ...result,
      connectionTest: lastDoctorConnectionTest,
    };
  }

  const runDedupedDoctorChecks = createDoctorRunChecksDeduper(buildDoctorResult);

  ipcMain.handle("doctor:run-checks", async () => (
    redactDoctorResult(await runDedupedDoctorChecks(), getDoctorRedactionOptions(app))
  ));

  // Lightweight Codex-only hook-health probe for the Agents tab badge. Reuses
  // the same per-agent integration check the Doctor uses, but skips the full
  // doctor sweep so opening the Agents tab stays cheap. Returns a render-safe
  // subset (no raw fs paths — detailText/error stay main-side).
  ipcMain.handle("doctor:codex-hook-health", () => {
    const verdict = getCodexHookHealth({ prefs: getPrefsSnapshot() });
    return {
      available: verdict.available,
      healthy: verdict.healthy,
      signature: verdict.signature,
      reasonKey: verdict.reasonKey,
      status: verdict.status,
      fixAction: verdict.fixAction,
    };
  });

  ipcMain.handle("doctor:test-connection", async (_event, payload) => {
    const result = await runDedupedDoctorConnectionTest(normalizeDoctorConnectionTestPayload(payload));
    return redactDoctorResult(result, getDoctorRedactionOptions(app));
  });

  ipcMain.handle("doctor:test-conversation-jump", async () => {
    const result = await runConversationJumpCheck({ getSessionSnapshot, focusSession });
    if (typeof onConversationJumpResult === "function") onConversationJumpResult(result);
    if (result.status === "failed") recordProblem(app.getPath("userData"), "conversation-jump");
    return result;
  });

  ipcMain.handle("doctor:open-clawd-log", async (_event, payload) => {
    const safePayload = normalizeDoctorOpenLogPayload(payload);
    return openClawdLog({
      requested: safePayload.name,
      homeDir: os.homedir(),
      userDataDir: app.getPath("userData"),
      shell,
    });
  });

  ipcMain.handle("doctor:get-report", () => {
    const result = buildDoctorReportResult();
    return formatDiagnosticReport(result, {
      version: app.getVersion(),
      platform: process.platform,
      release: os.release(),
      locale: getLocale(),
      ...getDoctorRedactionOptions(app),
    });
  });
}

module.exports = {
  registerDoctorIpc,
  __test: {
    createDoctorRunChecksDeduper,
    normalizeDoctorConnectionTestPayload,
    normalizeDoctorOpenLogPayload,
  },
};
