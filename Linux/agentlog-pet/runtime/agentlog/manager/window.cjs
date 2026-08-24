"use strict";

function createManagerWindowController({ app, BrowserWindow, iconPath, preloadPath, rendererPath } = {}) {
  if (!app) throw new TypeError("app is required");
  if (typeof BrowserWindow !== "function") throw new TypeError("BrowserWindow is required");
  if (typeof iconPath !== "string" || typeof preloadPath !== "string" || typeof rendererPath !== "string") {
    throw new TypeError("iconPath, preloadPath and rendererPath are required");
  }

  let managerWindow = null;
  let readyToShow = false;
  let shouldShow = false;
  let destroyed = false;

  function isDestroyed(window) {
    return !window || (typeof window.isDestroyed === "function" && window.isDestroyed());
  }

  function getWindow() {
    if (isDestroyed(managerWindow)) managerWindow = null;
    return managerWindow;
  }

  function focus() {
    const window = getWindow();
    if (!window || !readyToShow) return null;
    window.focus();
    return window;
  }

  function hide() {
    const window = getWindow();
    shouldShow = false;
    if (!window) return null;
    window.hide();
    return window;
  }

  function retireFailedWindow(window) {
    if (destroyed || managerWindow !== window) return;
    managerWindow = null;
    readyToShow = false;
    shouldShow = false;
    if (!isDestroyed(window)) {
      try {
        window.destroy();
      } catch {
        // Electron may have already torn down the native window resources.
      }
    }
  }

  function show() {
    if (destroyed) return null;

    let window = getWindow();
    shouldShow = true;
    if (window) {
      if (readyToShow) {
        window.show();
        focus();
      }
      return window;
    }

    readyToShow = false;
    window = new BrowserWindow({
      width: 1180,
      height: 760,
      minWidth: 900,
      minHeight: 620,
      title: "AgentLog Pet",
      icon: iconPath,
      show: false,
      backgroundColor: "#171918",
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    managerWindow = window;

    window.once("ready-to-show", () => {
      if (destroyed || managerWindow !== window || isDestroyed(window)) return;
      readyToShow = true;
      if (!shouldShow) return;
      window.show();
      focus();
    });
    window.on("close", (event) => {
      if (destroyed) return;
      event.preventDefault();
      hide();
    });
    window.once("closed", () => {
      if (managerWindow === window) managerWindow = null;
    });
    try {
      const loadResult = window.loadFile(rendererPath);
      if (loadResult && typeof loadResult.catch === "function") {
        loadResult.catch(() => retireFailedWindow(window));
      }
    } catch {
      retireFailedWindow(window);
    }
    return window;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    shouldShow = false;
    const window = getWindow();
    managerWindow = null;
    if (window && !isDestroyed(window)) window.destroy();
  }

  return Object.freeze({ show, hide, focus, getWindow, destroy });
}

module.exports = Object.freeze({ createManagerWindowController });
