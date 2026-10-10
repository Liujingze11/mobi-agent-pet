"use strict";

const fs = require("node:fs");

const EDITORS = new Map([
  ["code", "code"],
  ["code-insiders", "code"],
  ["cursor", "cursor"],
]);
const PROCESS_BOUNDARIES = new Set(["gnome-shell", "systemd", "init"]);
const TERMINALS = new Set([
  "kgx", "konsole", "kitty", "alacritty", "wezterm-gui", "ghostty",
  "xfce4-terminal", "tilix", "terminator", "xterm", "urxvt", "foot", "rio", "tabby",
]);

function isTerminalProcess(name) {
  return TERMINALS.has(name) || name.startsWith("gnome-terminal");
}

function readLinuxProcess(pid, readFileSync) {
  try {
    const raw = String(readFileSync(`/proc/${pid}/stat`, "utf8"));
    const open = raw.indexOf("(");
    const close = raw.lastIndexOf(")");
    if (open < 0 || close <= open) return null;
    const fields = raw.slice(close + 1).trim().split(/\s+/);
    const parentPid = Number(fields[1]);
    const startTicks = fields[19];
    if (!Number.isSafeInteger(parentPid) || parentPid < 0 || !/^\d+$/.test(startTicks || "")) return null;
    return { name: raw.slice(open + 1, close).toLowerCase(), parentPid, startTicks };
  } catch {
    return null;
  }
}

function resolveRecoveredClaudeFocus(lease, options = {}) {
  const platform = options.platform || process.platform;
  const agentPid = lease && lease.pid;
  if (platform !== "linux" || !lease || lease.agentId !== "claude-code"
      || !Number.isSafeInteger(agentPid) || agentPid <= 0
      || !/^linux:\d+$/.test(lease.processStartIdentity || "")) return null;
  const readFileSync = options.readFileSync || fs.readFileSync;
  const chain = [];
  const seen = new Set();
  let pid = agentPid;
  for (let depth = 0; depth < 12 && pid > 1 && !seen.has(pid); depth += 1) {
    const info = readLinuxProcess(pid, readFileSync);
    if (!info) return null;
    if (depth === 0 && `linux:${info.startTicks}` !== lease.processStartIdentity) return null;
    if (PROCESS_BOUNDARIES.has(info.name)) return null;
    chain.push(pid);
    const editor = EDITORS.get(info.name);
    if (editor) return { sourcePid: agentPid, editor, pidChain: chain };
    if (isTerminalProcess(info.name)) return { sourcePid: agentPid, editor: null, pidChain: chain };
    seen.add(pid);
    pid = info.parentPid;
  }
  return null;
}

module.exports = { resolveRecoveredClaudeFocus };
