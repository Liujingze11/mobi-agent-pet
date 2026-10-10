"use strict";

const { classifyConversationJumpResult } = require("./conversation-jump-result");

async function runConversationJumpCheck({ getSessionSnapshot, focusSession }) {
  const snapshot = typeof getSessionSnapshot === "function" ? getSessionSnapshot() : null;
  const sessions = snapshot && Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
  const target = sessions
    .filter((session) => session && session.canFocus === true && !session.host && !session.hiddenFromHud)
    .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))[0];
  if (!target) return { status: "unavailable" };
  const agentName = target.agentName || "Agent";
  try {
    const result = await focusSession(target.id, { requestSource: "doctor" });
    return { status: classifyConversationJumpResult(result), agentName };
  } catch {
    return { status: "failed", agentName };
  }
}

module.exports = { runConversationJumpCheck };
