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
    iconThemeRoot: path.join(root, "icons"),
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
  let currentIcon = "agentlog-pet";
  let menuOpenedHandler = () => {};
  let operations = Promise.resolve();

  function enqueue(operation) {
    const result = operations.then(operation, operation);
    operations = result.catch(() => {});
    return result;
  }

  function createElectronBackend(iconThemeRoot = null) {
    const normalIcon = loadTrayNormalIcon({
      nativeImage,
      platform,
      iconPath: path.join(__dirname, "..", "..", "..", "assets", "brand", "icons", "32x32.png"),
    });
    const statusIconDirectory = iconThemeRoot
      ? path.join(iconThemeRoot, "hicolor", "32x32", "status")
      : path.join(__dirname, "..", "..", "..", "assets", "tray-icons", "hicolor", "32x32", "status");
    const attentionIcon = loadTrayFlashIcon({
      nativeImage,
      platform,
      flashPath: path.join(statusIconDirectory, "agentlog-pet-question.png"),
      fileExists: (iconPath) => fs.existsSync(iconPath),
    }) || normalIcon;
    const statusIcons = {};
    for (const status of ["working", "question", "error"]) {
      statusIcons[`agentlog-pet-${status}`] = loadTrayNormalIcon({
        nativeImage,
        platform,
        iconPath: path.join(statusIconDirectory, `agentlog-pet-${status}.png`),
      });
    }
    return createElectronTrayBackend({
      Tray,
      Menu,
      normalIcon,
      attentionIcon,
      statusIcons,
      tooltip: "Mobi Agent Pet",
      dispatch: (id) => snapshot && snapshot.commands.execute(id),
    });
  }

  function createBackend() {
    if (platform !== "linux") return createElectronBackend();

    const resources = resolveLinuxTrayResources({ app, path, process: processRef });
    fallback = createElectronBackend(resources.iconThemeRoot);
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
          if (currentIcon !== "agentlog-pet" && typeof startingBackend.setIcon === "function") {
            await startingBackend.setIcon(currentIcon);
          }
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
      currentIcon = active === true ? "agentlog-pet-attention" : "agentlog-pet";
      return enqueue(async () => {
        if (backend) await backend.setAttention(active === true);
      });
    },

    setIcon(icon) {
      currentIcon = icon;
      return enqueue(async () => {
        if (backend && typeof backend.setIcon === "function") await backend.setIcon(icon);
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
