"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { PRICE_CATALOG_DATE, parseClaudeUsage, parseCodexUsage, summarizeUsageRecords } = require("./token-usage.cjs");

const MAX_BYTES = 256 * 1024 * 1024;

function rawLocalId(sourceSessionId) {
  if (typeof sourceSessionId !== "string") return null;
  const parts = sourceSessionId.split(".");
  if (parts.length !== 3 || parts[0] !== "s1") return null;
  try {
    if (Buffer.from(parts[1], "base64url").toString("utf8") !== "local") return null;
    return Buffer.from(parts[2], "base64url").toString("utf8");
  } catch {
    return null;
  }
}

async function collectRollouts(root, fsPromises, result = new Map()) {
  let entries;
  try { entries = await fsPromises.readdir(root, { withFileTypes: true }); }
  catch { return result; }
  for (const entry of entries) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) await collectRollouts(file, fsPromises, result);
    else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
      const id = entry.name.match(/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.jsonl$/i)?.[1];
      if (id) result.set(id, file);
    }
  }
  return result;
}

function createLocalUsageReader({ homeDir = os.homedir(), fileSystem = fs, now = Date.now } = {}) {
  const claudeRoot = path.resolve(homeDir, ".claude", "projects");
  const codexRoot = path.resolve(homeDir, ".codex", "sessions");
  const cache = new Map();
  let rolloutIndex = null;
  let indexAt = 0;

  async function locate(session) {
    const raw = rawLocalId(session.sourceSessionId);
    if (!raw) return null;
    if (session.agentId === "claude-code") {
      const file = session.transcriptPath && path.resolve(session.transcriptPath);
      if (!file || !file.startsWith(`${claudeRoot}${path.sep}`) || !file.endsWith(".jsonl")) return null;
      return { file, raw };
    }
    if (session.agentId === "codex") {
      const id = raw.match(/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i)?.[1];
      if (!id) return null;
      if (!rolloutIndex || now() - indexAt > 30_000) {
        rolloutIndex = await collectRollouts(codexRoot, fileSystem.promises);
        indexAt = now();
      }
      const file = rolloutIndex.get(id);
      return file ? { file, raw: id } : null;
    }
    return null;
  }

  async function recordsFor(session, { force = false } = {}) {
    const located = await locate(session);
    if (!located) return null;
    const { file, raw } = located;
    let stat;
    try { stat = await fileSystem.promises.stat(file); }
    catch { return null; }
    if (!stat.isFile() || stat.size > MAX_BYTES) return null;
    if (session.agentId === "claude-code") {
      let realFile;
      try { realFile = await fileSystem.promises.realpath(file); } catch { return null; }
      if (!realFile.startsWith(`${claudeRoot}${path.sep}`)) return null;
    }
    const cached = cache.get(file);
    if (!force && cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return cached.records;
    const entries = [];
    const stream = fileSystem.createReadStream(file, { encoding: "utf8" });
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (line.length > 4 * 1024 * 1024) continue;
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }
        if (session.agentId === "claude-code") {
          if (entry.type === "assistant" && entry.message?.usage) {
            entries.push({ type: entry.type, timestamp: entry.timestamp, sessionId: entry.sessionId,
              isSidechain: entry.isSidechain, isSubagent: entry.isSubagent,
              isApiErrorMessage: entry.isApiErrorMessage,
              message: { id: entry.message.id, model: entry.message.model, usage: entry.message.usage } });
          }
        } else if (entry.payload?.type === "token_count" || entry.type === "turn_context") {
          entries.push({ timestamp: entry.timestamp, payload: entry.payload?.type === "token_count"
            ? { type: "token_count", info: { total_token_usage: entry.payload.info?.total_token_usage,
              last_token_usage: entry.payload.info?.last_token_usage } }
            : { type: "turn_context", model: entry.payload.model } });
        }
      }
    } catch { return null; }
    finally { lines.close(); stream.destroy(); }
    const records = session.agentId === "claude-code" ? parseClaudeUsage(entries, raw) : parseCodexUsage(entries);
    cache.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, records });
    return records;
  }

  async function sessionSummary(session) {
    const records = await recordsFor(session);
    if (!records || !records.length) return null;
    const summary = summarizeUsageRecords(records);
    return { ...summary, models: [...new Set(records.map((record) => record.model).filter(Boolean))] };
  }

  async function report(sessions, { start, end, boundaries = [start, end], force = false }) {
    if (force) {
      rolloutIndex = await collectRollouts(codexRoot, fileSystem.promises);
      indexAt = now();
    }
    const tokenBuckets = boundaries.slice(0, -1).map((bucketStart, index) => ({
      start: bucketStart, end: boundaries[index + 1], inputTokens: 0, outputTokens: 0,
    }));
    const totals = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0,
      cacheWriteTokens: 0, estimatedUsd: 0, measuredSessions: 0, pricedSessions: 0, pricedRecords: 0,
      eligibleSessions: sessions.filter((session) => session.expectedInPeriod !== false).length,
      missingLogSessions: 0, priceCatalogDate: PRICE_CATALOG_DATE };
    const sessionUsage = {};
    for (const session of sessions) {
      let records;
      try { records = await recordsFor(session, { force }); } catch { records = null; }
      if (!records) {
        if (session.expectedInPeriod !== false) totals.missingLogSessions += 1;
        continue;
      }
      const current = summarizeUsageRecords(records, { start, end });
      const complete = summarizeUsageRecords(records);
      if (complete.measuredRecords) sessionUsage[session.id] = {
        ...complete, models: [...new Set(records.map((record) => record.model).filter(Boolean))],
      };
      if (!current.measuredRecords) continue;
      if (session.expectedInPeriod === false) totals.eligibleSessions += 1;
      totals.measuredSessions += 1;
      for (const key of ["inputTokens", "outputTokens", "cachedInputTokens", "cacheWriteTokens"]) totals[key] += current[key];
      if (current.estimatedUsd != null) totals.estimatedUsd += current.estimatedUsd;
      totals.pricedRecords += current.pricedRecords;
      if (current.pricedRecords === current.measuredRecords) totals.pricedSessions += 1;
      for (const record of records) {
        if (record.at == null || record.at < start || record.at >= end) continue;
        const bucket = tokenBuckets.find((candidate) => record.at >= candidate.start && record.at < candidate.end);
        if (!bucket) continue;
        bucket.inputTokens += record.inputTokens;
        bucket.outputTokens += record.outputTokens;
      }
    }
    if (!totals.measuredSessions) {
      for (const key of ["inputTokens", "outputTokens", "cachedInputTokens", "cacheWriteTokens", "estimatedUsd"]) totals[key] = null;
    } else if (!totals.pricedRecords) totals.estimatedUsd = null;
    return { usage: totals, sessionUsage, tokenBuckets };
  }

  return { recordsFor, report, sessionSummary };
}

module.exports = { createLocalUsageReader, rawLocalId };
