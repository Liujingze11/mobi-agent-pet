"use strict";

const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
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
const { createAgentSessionTracker } = require("./sessions/agent-session-tracker.cjs");
const { createHumanTimer } = require("./time/human-timer.cjs");
const { registerManagerIpc } = require("./manager/ipc.cjs");
const { createManagerWindowController } = require("./manager/window.cjs");

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
    const ingestor = createDurableIngestor({
      db: openedDatabase,
      projectResolver,
      sessionTracker,
      onChange: () => managerIpcRegistration?.notify("agent-events"),
    });
    const overviewQueries = createOverviewQueries(openedDatabase);
    const humanTimer = createHumanTimer({
      db: openedDatabase,
      createId: randomUUID,
      projectRepository,
    });

    sessionTracker.reconcileInterrupted(Date.now());
    const nextServices = {
      database: openedDatabase,
      projectRepository,
      projectResolver,
      sessionTracker,
      ingestor,
      overviewQueries,
      humanTimer,
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
        overviewQueries,
        humanTimer,
        runtime: api,
        hostBridge: bridge,
      });
    }
    database = openedDatabase;
    services = nextServices;
    ready = true;
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
  }
}

function install(electron = require("electron")) {
  if (installed) return api;
  installed = true;
  const { app } = electron;
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
  try {
    app.whenReady().then(
      () => start(app, electron),
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

const api = Object.freeze({
  install,
  getServices,
  getHealth,
  openManager,
  notifyManager,
  showManager,
  registerHostActions,
  setTrayHealthProvider,
  shutdown,
});

module.exports = api;
