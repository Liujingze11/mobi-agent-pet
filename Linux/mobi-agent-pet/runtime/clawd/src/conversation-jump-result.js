"use strict";

const FAILED_REASONS = new Set([
  "no-source-pid",
  "window-not-found",
  "activate-rejected",
  "x11-unavailable",
  "window-not-active",
  "terminal-tab-not-found",
  "focus-submit-failed",
  "session-not-found",
]);

function classifyConversationJumpResult(result) {
  if (result === false || result == null) return "failed";
  if (result && result.confirmed === true) return "ok";
  if (result && (result.status === "failed" || FAILED_REASONS.has(result.reason))) return "failed";
  return "submitted";
}

module.exports = { classifyConversationJumpResult };
