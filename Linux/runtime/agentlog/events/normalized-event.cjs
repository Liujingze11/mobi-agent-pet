"use strict";

const { createHash } = require("node:crypto");

const MAX_TEXT_LENGTH = 16_384;
const PERMISSION_EVENTS = new Set([
  "PermissionRequest",
  "CodexUserInputRequest",
  "Elicitation",
]);

function text(value, max = MAX_TEXT_LENGTH) {
  if (value == null) return null;
  const normalized = String(value);
  return normalized.length <= max ? normalized : normalized.slice(0, max);
}

function epoch(value) {
  if (Number.isFinite(value) && value >= 0) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function categoryFor(event, state) {
  if (PERMISSION_EVENTS.has(event)) return "permission_requested";
  if (event === "SessionStart") return "session_started";
  if (event === "SessionEnd") return "session_ended";
  if (event === "UserPromptSubmit") return "turn_started";
  if (event === "Stop" || state === "attention") return "completed";
  if (state === "error" || /error|fail/i.test(event || "")) return "errored";
  if (/tool|command|patch|exec/i.test(event || "")) return "tool_activity";
  return "state_changed";
}

function hashId(parts) {
  return `evt_${createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 24)}`;
}

function normalizeAgentEvent(input, context = {}) {
  if (!input || typeof input !== "object") throw new TypeError("agent event input must be an object");
  const opts = input.opts && typeof input.opts === "object" ? input.opts : {};
  const sessionId = text(input.sessionId, 512);
  if (!sessionId) throw new TypeError("agent event sessionId is required");

  const now = typeof context.now === "function" ? context.now : Date.now;
  const receivedAt = Math.trunc(now());
  const sourceEventId = text(opts.sourceEventId, 512);
  const sourceSequence = Number.isSafeInteger(opts.sourceSequence) ? opts.sourceSequence : null;
  const agentId = text(opts.agentId, 128) || "unknown";
  const type = text(input.event, 256) || "StateChanged";
  const state = text(input.state, 128) || "idle";
  const parsedTimestamp = epoch(opts.timestamp);
  const occurredAt = parsedTimestamp === null ? receivedAt : parsedTimestamp;
  const generatedSequence = Number.isSafeInteger(context.sequence) ? context.sequence : 0;
  const idSeed = sourceEventId
    ? [agentId, sessionId, sourceEventId]
    : sourceSequence != null
      ? [agentId, sessionId, String(sourceSequence)]
      : [agentId, sessionId, type, String(occurredAt), String(generatedSequence)];
  const hasPermission = PERMISSION_EVENTS.has(type)
    || opts.permissionAction != null
    || opts.permissionCommand != null
    || opts.permissionGateId != null;

  return Object.freeze({
    schemaVersion: 1,
    id: hashId(idSeed),
    sourceEventId,
    sourceSequence,
    agentId,
    sessionId,
    rawSessionId: text(opts.rawSessionId, 512) || sessionId,
    parentSessionId: text(opts.parentSessionId, 512),
    occurredAt,
    receivedAt,
    cwd: text(opts.cwd, 4096),
    type,
    category: categoryFor(type, state),
    state,
    toolName: text(opts.toolName, 512),
    transcriptPath: text(opts.transcriptPath, 4096),
    permission: hasPermission ? Object.freeze({
      action: text(opts.permissionAction, 512),
      command: text(opts.permissionCommand, 4096),
      gateId: text(opts.permissionGateId, 512),
    }) : null,
    payload: Object.freeze({
      sessionTitle: text(opts.sessionTitle, 1024),
      model: text(opts.model, 256),
      provider: text(opts.provider, 256),
      hookSource: text(opts.hookSource, 256),
      assistantLastOutput: text(opts.assistantLastOutput),
    }),
  });
}

module.exports = {
  MAX_TEXT_LENGTH,
  normalizeAgentEvent,
};
