"use strict";

const { randomUUID } = require("node:crypto");
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

const DATABASE_NAME = "agentlog.db";
let installed = false;
let ready = false;
let shuttingDown = false;
let database = null;
let services = null;
let unsubscribe = null;
let shutdownPromise = null;
let pending = [];
let health = {
  storage: "starting",
  databaseName: DATABASE_NAME,
  errorMessage: null,
};

function getHealth() {
  return { ...health };
}

function getServices() {
  return services;
}

function failReadiness(app) {
  health = {
    storage: "error",
    databaseName: DATABASE_NAME,
    errorMessage: "Unable to open AgentLog storage",
  };
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  pending = [];
  app.removeListener("before-quit", shutdown);
}

function start(app) {
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
      errorMessage: "Unable to open AgentLog storage",
    };
  }
}

function install(electron = require("electron")) {
  if (installed) return api;
  installed = true;
  const { app } = electron;
  unsubscribe = bridge.subscribeToAgentEvents((event) => {
    if (ready) services.ingestor.ingest(event);
    else pending.push(event);
  });
  app.once("before-quit", shutdown);
  try {
    app.whenReady().then(
      () => start(app),
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

const api = Object.freeze({
  install,
  getServices,
  getHealth,
  showManager,
  registerHostActions,
  shutdown,
});

module.exports = api;
