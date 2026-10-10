"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FILE_NAME = "problem-journal.json";
const ALLOWED_CODES = new Set([
  "agent-connection", "local-service", "icon-unavailable", "pet-window",
  "storage-unavailable", "usage-refresh", "tray-unavailable", "remote-connection",
  "conversation-jump",
]);
const MAX_ENTRIES = 50;
const DEDUPE_MS = 60 * 60 * 1000;

function filePath(dir) { return path.join(dir, FILE_NAME); }

function readProblems(dir) {
  if (typeof dir !== "string" || !dir) return [];
  try {
    const stat = fs.statSync(filePath(dir));
    if (!stat.isFile() || stat.size > 65536) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath(dir), "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && ALLOWED_CODES.has(entry.code)
      && Number.isFinite(entry.at) && (entry.agentId == null || /^[a-z0-9-]{1,64}$/.test(entry.agentId)))
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function recordProblem(dir, code, options = {}) {
  if (typeof dir !== "string" || !dir || !ALLOWED_CODES.has(code)) return false;
  const agentId = options.agentId == null ? null : options.agentId;
  if (agentId !== null && (typeof agentId !== "string" || !/^[a-z0-9-]{1,64}$/.test(agentId))) return false;
  const at = Number.isFinite(options.now) ? options.now : Date.now();
  const entries = readProblems(dir);
  if (entries.some((entry) => entry.code === code && (entry.agentId || null) === agentId && at - entry.at >= 0 && at - entry.at < DEDUPE_MS)) return true;
  const next = [{ code, at, ...(agentId ? { agentId } : {}) }, ...entries].slice(0, MAX_ENTRIES);
  const target = filePath(dir);
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
    fs.renameSync(temporary, target);
    fs.chmodSync(target, 0o600);
    return true;
  } catch {
    try { fs.unlinkSync(temporary); } catch {}
    return false;
  }
}

module.exports = { readProblems, recordProblem };
