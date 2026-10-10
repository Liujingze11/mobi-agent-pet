"use strict";

const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const bridge = require("./runtime-bridge.cjs");
const {
  closeAgentLogDatabase,
  openAgentLogDatabase,
} = require("./storage/database.cjs");
const { createDurableIngestor } = require("./events/durable-ingestor.cjs");
const { createProjectRepository } = require("./projects/project-repository.cjs");
const { createProjectResolver } = require("./projects/project-resolver.cjs");
const { createOverviewQueries } = require("./queries/overview.cjs");
const { createLocalUsageReader } = require("./analytics/local-usage-reader.cjs");
const { createAgentSessionTracker } = require("./sessions/agent-session-tracker.cjs");
const { createProjectAssignment } = require("./sessions/project-assignment.cjs");
const { createHumanTimer } = require("./time/human-timer.cjs");
const { registerManagerIpc } = require("./manager/ipc.cjs");
const { recordProblem: appendProblem } = require("./problem-journal.cjs");
const { createManagerWindowController } = require("./manager/window.cjs");
const { createProviderVault } = require("./providers/vault.cjs");
const { createProviderRepository } = require("./providers/repository.cjs");
const { createProviderService } = require("./providers/service.cjs");
const { createProviderFileTransaction } = require("./providers/file-transaction.cjs");
const { createProviderActivation } = require("./providers/activation.cjs");
const { createClaudeAdapter } = require("./providers/adapters/claude.cjs");
const { createCodexAdapter } = require("./providers/adapters/codex.cjs");
const { createGeminiAdapter } = require("./providers/adapters/gemini.cjs");
const { createCoexistingAdapter } = require("./providers/adapters/coexisting.cjs");
const { createGrokAdapter } = require("./providers/adapters/grokbuild.cjs");
const { createDesktopAdapter } = require("./providers/adapters/claude-desktop.cjs");
const { createProviderBalanceStore } = require("./providers/balance-store.cjs");
const { createProviderBalanceQuery } = require("./providers/balance-query.cjs");
const { createProviderProfileTransfer } = require("./providers/profile-transfer.cjs");

const DATABASE_NAME = "agentlog.db";
let installed = false;
let ready = false;
let shuttingDown = false;
let database = null;
let services = null;
let unsubscribe = null;
let shutdownPromise = null;
let managerIpcRegistration = null;
let managerWindowController = null;
let pending = [];
let health = {
  storage: "starting",
  databaseName: DATABASE_NAME,
  errorMessage: null,
};
let trayHealthProvider = () => ({ status: "starting", code: null });
let problemDir = null;
const balanceListeners = new Set();

function recordProblem(code, options) {
  return problemDir ? appendProblem(problemDir, code, options) : false;
}

function getTrayHealth() {
  try {
    const tray = trayHealthProvider();
    const status = tray && tray.status;
    const code = tray && tray.code;
    if (typeof status === "string" && (code === null || typeof code === "string")) {
      return { status, code };
    }
  } catch {
    // Tray diagnostics must not make AgentLog storage diagnostics unavailable.
  }
  return { status: "starting", code: null };
}

function getHealth() {
  return { ...health, tray: getTrayHealth() };
}

function setTrayHealthProvider(provider) {
  trayHealthProvider = typeof provider === "function"
    ? provider
    : () => ({ status: "starting", code: null });
}

function getServices() {
  return services;
}

function failReadiness(app) {
  health = {
    storage: "error",
    databaseName: DATABASE_NAME,
    errorMessage: "Unable to open Mobi Agent Pet storage",
  };
  recordProblem("storage-unavailable");
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  pending = [];
  app.removeListener("before-quit", shutdown);
}

function start(app, electron) {
  if (ready || shuttingDown) return;

  let openedDatabase = null;
  try {
    const databasePath = path.join(app.getPath("userData"), "data", DATABASE_NAME);
    openedDatabase = openAgentLogDatabase({ databasePath });
    const projectRepository = createProjectRepository(openedDatabase, { createId: randomUUID });
    const projectResolver = createProjectResolver({ repository: projectRepository });
    const sessionTracker = createAgentSessionTracker(openedDatabase, { createId: randomUUID });
    const projectAssignment = createProjectAssignment(openedDatabase);
    const ingestor = createDurableIngestor({
      db: openedDatabase,
      projectResolver,
      sessionTracker,
      onChange: () => managerIpcRegistration?.notify("agent-events"),
    });
    const overviewQueries = createOverviewQueries(openedDatabase);
    const usageReader = createLocalUsageReader();
    const humanTimer = createHumanTimer({
      db: openedDatabase,
      createId: randomUUID,
      projectRepository,
    });
    const providerVault = createProviderVault({ safeStorage: electron.safeStorage || {
      isEncryptionAvailable: () => false,
      getSelectedStorageBackend: () => "unknown",
    } });
    const providerRepository = createProviderRepository(openedDatabase, { createId: randomUUID, vault: providerVault });
    const providerTransaction = createProviderFileTransaction({ db: openedDatabase, fs, vault: providerVault });
    providerTransaction.recover();
    const providerActivation = createProviderActivation({
      repository: providerRepository, transaction: providerTransaction, fs,
      adapters: {
        claude: createClaudeAdapter({ fs, home: os.homedir() }),
        codex: createCodexAdapter({ fs, home: os.homedir() }),
        gemini: createGeminiAdapter({ fs, home: os.homedir() }),
        grokbuild: createGrokAdapter({ fs, home: os.homedir() }),
        "claude-desktop": createDesktopAdapter({ fs, home: os.homedir() }),
        ...Object.fromEntries(["opencode", "openclaw", "hermes", "pi", "mcode"]
          .map((appId) => [appId, createCoexistingAdapter(appId, { fs, home: os.homedir() })])),
      },
    });
    const providerService = createProviderService({
      repository: providerRepository, fs,
      paths: {
        claude: path.join(os.homedir(), ".claude", "settings.json"),
        codex: path.join(os.homedir(), ".codex", "config.toml"),
        gemini: path.join(os.homedir(), ".gemini", "settings.json"),
      },
    });
    const providerBalanceStore = createProviderBalanceStore(openedDatabase);
    const providerProfileTransfer = createProviderProfileTransfer({ repository: providerRepository, db: openedDatabase });
    const announceProviderBalance = () => {
      managerIpcRegistration?.notify("providers");
      for (const listener of balanceListeners) {
        try { listener(); } catch { /* Subscriber lifecycle is independent of balance storage. */ }
      }
    };
    const providerBalanceQuery = createProviderBalanceQuery({
      repository: providerRepository, store: providerBalanceStore,
      onChange: announceProviderBalance,
    });

    sessionTracker.reconcileInterrupted(Date.now());
    const nextServices = {
      database: openedDatabase,
      projectRepository,
      projectResolver,
      sessionTracker,
      projectAssignment,
      ingestor,
      overviewQueries,
      usageReader,
      humanTimer,
      providerRepository,
      providerService,
      providerActivation,
      providerBalanceStore,
      providerBalanceQuery,
      providerProfileTransfer,
    };
    while (pending.length > 0) {
      ingestor.ingest(pending[0]);
      pending.shift();
    }
    if (!managerIpcRegistration) {
      managerIpcRegistration = registerManagerIpc({
        ipcMain: electron.ipcMain,
        fs,
        dialog: electron.dialog,
        BrowserWindow: electron.BrowserWindow,
        projectRepository,
        projectAssignment,
        overviewQueries,
        usageReader,
        humanTimer,
        providerService,
        providerActivation,
        providerBalanceStore,
        providerBalanceQuery,
        providerProfileTransfer,
        onProviderBalanceChange: announceProviderBalance,
        runtime: api,
        hostBridge: bridge,
      });
    }
    database = openedDatabase;
    services = nextServices;
    ready = true;
    providerBalanceQuery.scheduleVisible();
    health = {
      storage: "ready",
      databaseName: DATABASE_NAME,
      errorMessage: null,
    };
  } catch (error) {
    if (openedDatabase && openedDatabase !== database) closeAgentLogDatabase(openedDatabase);
    health = {
      storage: "error",
      databaseName: DATABASE_NAME,
      errorMessage: "Unable to open Mobi Agent Pet storage",
    };
    recordProblem("storage-unavailable");
  }
}

function install(electron = require("electron")) {
  if (installed) return api;
  installed = true;
  const { app } = electron;
  problemDir = app.getPath("userData");
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.resolve(__dirname, "../../assets/brand/icon.png");
  managerWindowController = createManagerWindowController({
    app,
    BrowserWindow: electron.BrowserWindow,
    iconPath,
    preloadPath: path.join(__dirname, "manager", "preload.cjs"),
    rendererPath: path.resolve(__dirname, "../../dist/manager/index.html"),
  });
  unsubscribe = bridge.subscribeToAgentEvents((event) => {
    if (ready) services.ingestor.ingest(event);
    else pending.push(event);
  });
  app.once("before-quit", shutdown);
  const openManagerOnStartup = process.env.AGENTLOG_OPEN_MANAGER_ON_STARTUP === "1";
  try {
    app.whenReady().then(
      () => {
        start(app, electron);
        if (openManagerOnStartup) openManager();
      },
      () => failReadiness(app)
    );
  } catch (error) {
    failReadiness(app);
  }
  return api;
}

function shutdown() {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  pending = [];
  if (managerIpcRegistration) {
    managerIpcRegistration.dispose();
    managerIpcRegistration = null;
  }
  if (managerWindowController) {
    managerWindowController.destroy();
    managerWindowController = null;
  }
  if (database) {
    services?.providerBalanceQuery?.stop();
    closeAgentLogDatabase(database);
    database = null;
  }
  shutdownPromise = Promise.resolve();
  return shutdownPromise;
}

function registerHostActions(actions) {
  return bridge.registerHostActions(actions);
}

function showManager(...args) {
  return bridge.invokeHostAction("openAgentLogManager", ...args);
}

function openManager() {
  return ready && managerWindowController ? managerWindowController.show() : null;
}

function notifyManager(scope) {
  if (managerIpcRegistration) managerIpcRegistration.notify(scope);
}

function getProviderBalanceSnapshot() {
  if (!ready || !services) return [];
  const ids = services.providerBalanceQuery.visibleIds();
  const rows = new Map(services.providerRepository.list().map((row) => [row.id, row]));
  return services.providerBalanceStore.listVisible({ activeIds: ids }).map((balance) => ({
    ...balance, appId: rows.get(balance.providerId)?.appId || null,
    providerName: rows.get(balance.providerId)?.name || "",
  })).filter((balance) => balance.appId);
}

function subscribeProviderBalances(listener) {
  if (typeof listener !== "function") throw new TypeError("listener must be a function");
  balanceListeners.add(listener);
  return () => balanceListeners.delete(listener);
}

const api = Object.freeze({
  install,
  getServices,
  getHealth,
  recordProblem,
  openManager,
  notifyManager,
  getProviderBalanceSnapshot,
  subscribeProviderBalances,
  showManager,
  registerHostActions,
  setTrayHealthProvider,
  shutdown,
});

module.exports = api;
