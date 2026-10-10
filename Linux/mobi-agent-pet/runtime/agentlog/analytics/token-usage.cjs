"use strict";

// API-equivalent USD prices per million tokens, checked 2026-09-24.
// These are estimates for local subscriptions; they are not billed amounts.
// Sources: https://developers.openai.com/api/docs/pricing
//          https://platform.claude.com/docs/en/about-claude/pricing
const PRICES = [
  ["gpt-6-astra", { input: 10, cached: 1, write: 12.5, output: 50 }],
  ["gpt-6-sol", { input: 2, cached: .2, write: 2.5, output: 10 }],
  ["gpt-6-luna", { input: .1, cached: .01, write: .125, output: .5 }],
  ["gpt-5.6-sol", { input: 4, cached: .4, write: 5, output: 20 }],
  ["gpt-5.3-codex", { input: 1.75, cached: .175, write: 1.75, output: 14 }],
  ["gpt-5.2-codex", { input: 1.75, cached: .175, write: 1.75, output: 14 }],
  ["claude-opus-5-5", { input: 4, cached: .2, write: 5, output: 20 }],
  ["claude-opus-5", { input: 5, cached: .5, write: 6.25, output: 25 }],
  ["claude-opus-4-8", { input: 5, cached: .5, write: 6.25, output: 25 }],
  ["claude-opus-4-7", { input: 5, cached: .5, write: 6.25, output: 25 }],
  ["claude-opus-4-6", { input: 5, cached: .5, write: 6.25, output: 25 }],
  ["claude-opus-4-5", { input: 5, cached: .5, write: 6.25, output: 25 }],
  ["claude-sonnet-5", { input: 2, cached: .2, write: 2.5, output: 10 }],
  ["claude-sonnet-4-6", { input: 3, cached: .3, write: 3.75, output: 15 }],
  ["claude-sonnet-4-5", { input: 3, cached: .3, write: 3.75, output: 15 }],
  ["claude-haiku-4-5", { input: 1, cached: .1, write: 1.25, output: 5 }],
];

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function timestamp(value) {
  const at = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

function priceFor(model) {
  if (typeof model !== "string") return null;
  const normalized = model.toLowerCase();
  return PRICES.find(([prefix]) => normalized === prefix || normalized.startsWith(`${prefix}-`))?.[1] || null;
}

function parseClaudeUsage(entries, sessionId = null) {
  if (!Array.isArray(entries)) return [];
  const messages = new Map();
  for (const entry of entries) {
    if (!entry || entry.type !== "assistant" || entry.isSidechain === true
      || entry.isSubagent === true || entry.isApiErrorMessage === true) continue;
    if (sessionId && entry.sessionId && entry.sessionId !== sessionId) continue;
    const message = entry.message;
    if (!message || typeof message.id !== "string" || !message.id || !message.usage) continue;
    const usage = message.usage;
    const regularInput = count(usage.input_tokens);
    const cachedInput = count(usage.cache_read_input_tokens);
    const cacheWrite = count(usage.cache_creation_input_tokens);
    const record = {
      at: timestamp(entry.timestamp),
      model: typeof message.model === "string" ? message.model : null,
      inputTokens: regularInput + cachedInput + cacheWrite,
      outputTokens: count(usage.output_tokens),
      cachedInputTokens: cachedInput,
      cacheWriteTokens: cacheWrite,
    };
    const prior = messages.get(message.id);
    if (!prior || record.inputTokens + record.outputTokens >= prior.inputTokens + prior.outputTokens) {
      messages.set(message.id, record);
    }
  }
  return [...messages.values()];
}

function parseCodexUsage(entries) {
  if (!Array.isArray(entries)) return [];
  const records = [];
  let model = null;
  let previous = null;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const payload = entry.payload && typeof entry.payload === "object" ? entry.payload : {};
    if (entry.type === "turn_context" || payload.type === "turn_context") {
      if (typeof payload.model === "string" && payload.model) model = payload.model;
    }
    if (payload.type !== "token_count") continue;
    const totals = payload.info && payload.info.total_token_usage;
    if (!totals || typeof totals !== "object") continue;
    const current = {
      inputTokens: count(totals.input_tokens),
      outputTokens: count(totals.output_tokens),
      cachedInputTokens: count(totals.cached_input_tokens),
      cacheWriteTokens: count(totals.cache_write_input_tokens),
    };
    const last = payload.info?.last_token_usage;
    const lastTurn = last && typeof last === "object" ? {
      inputTokens: count(last.input_tokens),
      outputTokens: count(last.output_tokens),
      cachedInputTokens: count(last.cached_input_tokens),
      cacheWriteTokens: count(last.cache_write_input_tokens),
    } : null;
    const reset = previous && Object.keys(current).some((key) => current[key] < previous[key]);
    const useLastTurn = lastTurn && (!previous || reset);
    const delta = useLastTurn ? lastTurn : Object.fromEntries(Object.entries(current).map(([key, value]) => [
      key, previous && value >= previous[key] ? value - previous[key] : value,
    ]));
    const baselineSkipped = Boolean(useLastTurn && Object.keys(current).some((key) => current[key] > lastTurn[key]));
    previous = current;
    if (!Object.values(delta).some(Boolean) && !baselineSkipped) continue;
    records.push({ at: timestamp(entry.timestamp), model, ...delta, baselineSkipped });
  }
  return records;
}

function summarizeUsageRecords(records, { start = -Infinity, end = Infinity } = {}) {
  const summary = {
    inputTokens: 0, outputTokens: 0, cachedInputTokens: 0,
    cacheWriteTokens: 0, estimatedUsd: null, pricedRecords: 0, measuredRecords: 0, undatedRecords: 0,
  };
  for (const record of records || []) {
    if (record.at == null) {
      if (start !== -Infinity || end !== Infinity) continue;
      summary.undatedRecords += 1;
    } else if (record.at < start || record.at >= end) continue;
    summary.measuredRecords += 1;
    const input = count(record.inputTokens);
    const output = count(record.outputTokens);
    const cached = Math.min(input, count(record.cachedInputTokens));
    const written = Math.min(input - cached, count(record.cacheWriteTokens));
    summary.inputTokens += input;
    summary.outputTokens += output;
    summary.cachedInputTokens += cached;
    summary.cacheWriteTokens += written;
    const price = priceFor(record.model);
    if (!price) continue;
    summary.pricedRecords += 1;
    summary.estimatedUsd = (summary.estimatedUsd || 0)
      + ((input - cached - written) * price.input + cached * price.cached
        + written * price.write + output * price.output) / 1_000_000;
  }
  return summary;
}

module.exports = {
  PRICE_CATALOG_DATE: "2026-09-24",
  parseClaudeUsage,
  parseCodexUsage,
  priceFor,
  summarizeUsageRecords,
};
