"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("settingsAPI", {
  getModeConfig: () => ipcRenderer.invoke("settings:get-mode-config"),
  saveCustomMode: (profile, options = {}) => ipcRenderer.invoke("settings:save-custom-mode", {
    profile, confirmed: options.confirmed === true,
  }),
  onChanged(callback) {
    const listener = (_event, { changes } = {}) => {
      const relevant = {};
      for (const key of ["lang", "customModeProfile"]) {
        if (changes && Object.hasOwn(changes, key)) relevant[key] = changes[key];
      }
      if (Object.keys(relevant).length) callback({ changes: relevant });
    };
    ipcRenderer.on("settings-changed", listener);
    return () => ipcRenderer.removeListener("settings-changed", listener);
  },
});
