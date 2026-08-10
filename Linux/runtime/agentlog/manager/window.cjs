"use strict";

function createManagerWindowController({ app, BrowserWindow, preloadPath, rendererPath } = {}) {
  if (!app) throw new TypeError("app is required");
  if (typeof BrowserWindow !== "function") throw new TypeError("BrowserWindow is required");
  if (typeof preloadPath !== "string" || typeof rendererPath !== "string") {
    throw new TypeError("preloadPath and rendererPath are required");
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
      if (destroyed || managerWindow !== window || !shouldShow || isDestroyed(window)) return;
      readyToShow = true;
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
    window.loadFile(rendererPath);
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
