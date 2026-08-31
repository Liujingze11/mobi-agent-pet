"use strict";

const childProcess = require("child_process");
const nodeFs = require("fs");
const nodePath = require("path");
const { createElectronTrayBackend: defaultCreateElectronTrayBackend } = require("./tray-electron-backend");
const { createLinuxTraySupervisor: defaultCreateLinuxTraySupervisor } = require("./linux-tray-supervisor");
const { loadTrayNormalIcon, loadTrayFlashIcon } = require("./tray-flash-icon");

function resolveLinuxTrayResources({ app, path = nodePath, process = globalThis.process }) {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "tray")
    : path.join(app.getAppPath(), "build", "tray");
  return {
    helperPath: path.join(root, "bin", "agentlog-tray"),
    iconThemeRoot: path.join(root, "icons", "hicolor"),
  };
}

function createTrayShutdownGate({ stop, requestQuit, reportError = () => {} }) {
  let state = "idle";

  function onBeforeQuit(event) {
    if (state === "ready-to-quit") return true;

    event.preventDefault();
    if (state === "stopping") return false;

    state = "stopping";
    let stopping;
    try {
      stopping = stop();
    } catch (err) {
      reportError(err);
      state = "ready-to-quit";
      requestQuit();
      return false;
    }

    Promise.resolve(stopping)
      .catch((err) => reportError(err))
      .finally(() => {
        state = "ready-to-quit";
        requestQuit();
      });
    return false;
  }

  return { onBeforeQuit };
}

function createTrayRuntime(deps) {
  const {
    app,
    Tray,
    Menu,
    nativeImage,
    platform = process.platform,
    path = nodePath,
    process: processRef = process,
    fs = nodeFs,
    spawn = childProcess.spawn,
    createElectronTrayBackend = defaultCreateElectronTrayBackend,
    createLinuxTraySupervisor = defaultCreateLinuxTraySupervisor,
  } = deps;

  let backend = null;
  let fallback = null;
  let snapshot = null;
  let menuOpenedHandler = () => {};
  let operations = Promise.resolve();

  function enqueue(operation) {
    const result = operations.then(operation, operation);
    operations = result.catch(() => {});
    return result;
  }

  function createElectronBackend() {
    const normalIcon = loadTrayNormalIcon({
      nativeImage,
      platform,
      iconPath: path.join(__dirname, "..", "..", "..", "assets", "brand", "icons", "32x32.png"),
    });
    const attentionIcon = loadTrayFlashIcon({
      nativeImage,
      platform,
      flashPath: path.join(__dirname, "../assets/tray-icon-flash.png"),
      fileExists: (iconPath) => fs.existsSync(iconPath),
    }) || normalIcon;
    return createElectronTrayBackend({
      Tray,
      Menu,
      normalIcon,
      attentionIcon,
      tooltip: "AgentLog Pet",
      dispatch: (id) => snapshot && snapshot.commands.execute(id),
    });
  }

  function createBackend() {
    if (platform !== "linux") return createElectronBackend();

    fallback = createElectronBackend();
    const resources = resolveLinuxTrayResources({ app, path, process: processRef });
    return createLinuxTraySupervisor({
      spawn,
      ...resources,
      sessionType: processRef.env.XDG_SESSION_TYPE,
      fallback,
      getMenuSnapshot: async () => snapshot,
    });
  }

  function attachMenuOpenedHandler(nextBackend) {
    nextBackend.onMenuOpened(() => menuOpenedHandler());
  }

  return {
    start(nextSnapshot) {
      return enqueue(async () => {
        snapshot = nextSnapshot;
        if (backend) {
          await backend.replaceMenu(snapshot);
          return;
        }
        const startingBackend = createBackend();
        backend = startingBackend;
        attachMenuOpenedHandler(startingBackend);
        try {
          await startingBackend.start(snapshot);
        } catch (err) {
          if (backend === startingBackend) {
            backend = null;
            fallback = null;
          }
          throw err;
        }
      });
    },

    replaceMenu(nextSnapshot) {
      return enqueue(async () => {
        snapshot = nextSnapshot;
        if (backend) await backend.replaceMenu(snapshot);
      });
    },

    setAttention(active) {
      return enqueue(async () => {
        if (backend) await backend.setAttention(active === true);
      });
    },

    stop() {
      return enqueue(async () => {
        if (!backend) return;
        const stoppingBackend = backend;
        await stoppingBackend.stop();
        if (backend === stoppingBackend) {
          backend = null;
          fallback = null;
        }
      });
    },

    getHealth() {
      return backend ? backend.getHealth() : { status: "starting", code: null };
    },

    getNativeTray() {
      if (platform === "win32") {
        return backend && typeof backend.getNativeTray === "function"
          ? backend.getNativeTray()
          : null;
      }
      if (platform === "linux" && fallback && fallback.isActive()) {
        return fallback.getNativeTray();
      }
      return null;
    },

    onMenuOpened(handler) {
      menuOpenedHandler = typeof handler === "function" ? handler : () => {};
    },
  };
}

module.exports = { createTrayRuntime, createTrayShutdownGate, resolveLinuxTrayResources };
