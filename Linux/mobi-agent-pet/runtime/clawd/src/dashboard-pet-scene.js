"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");

function describeDashboardPetScene(theme, resolveAssetPath) {
  if (!theme || typeof theme !== "object") {
    return { themeId: null, name: null, imageUrl: null };
  }

  const themeId = typeof theme._id === "string" ? theme._id : null;
  const name = typeof theme.name === "string" && theme.name.trim()
    ? theme.name.trim()
    : themeId;
  const idleFile = Array.isArray(theme.states && theme.states.idle)
    ? theme.states.idle.find((filename) => typeof filename === "string" && filename)
    : null;

  let imageUrl = null;
  if (idleFile && typeof resolveAssetPath === "function") {
    try {
      const assetPath = resolveAssetPath(idleFile);
      if (typeof assetPath === "string" && path.isAbsolute(assetPath)) {
        imageUrl = pathToFileURL(assetPath).href;
      }
    } catch {
      // The scene is decorative; session data still renders if an asset fails.
    }
  }
  return { themeId, name, imageUrl };
}

module.exports = { describeDashboardPetScene };
