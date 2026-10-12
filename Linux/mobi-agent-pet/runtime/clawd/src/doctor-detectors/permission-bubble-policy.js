"use strict";

const { getBubblePolicy } = require("../bubble-policy");

function checkPermissionBubblePolicy(options = {}) {
  const prefs = options.prefs || {};
  let policy;
  try {
    policy = getBubblePolicy(prefs, "permission");
  } catch {
    policy = { enabled: prefs.permissionBubblesEnabled !== false && prefs.hideBubbles !== true };
  }

  if (!policy.enabled) {
    return {
      id: "permission-bubble-policy",
      status: "disabled-by-user",
      level: "info",
      detail: "Permission bubbles are turned off in Settings",
    };
  }

  if (options.doNotDisturb) {
    return {
      id: "permission-bubble-policy",
      status: "suppressed-by-dnd",
      level: "info",
      detail: "DND is on; bubbles are suppressed",
      textHint: "Open Settings from the tray to review the current mode if you want bubbles back.",
    };
  }

  return {
    id: "permission-bubble-policy",
    status: "pass",
    level: null,
    detail: "Permission bubbles are enabled",
  };
}

module.exports = { checkPermissionBubblePolicy };
