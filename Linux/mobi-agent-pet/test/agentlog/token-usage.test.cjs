"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseClaudeUsage,
  parseCodexUsage,
  summarizeUsageRecords,
} = require("../../runtime/agentlog/analytics/token-usage.cjs");

test("Claude usage keeps the final streaming update once and skips subagent entries", () => {
  const message = (id, output, extra = {}) => ({
    type: "assistant", timestamp: "2026-09-24T09:00:00Z", sessionId: "session-1", ...extra,
    message: { id, model: "claude-sonnet-4-5-20250929", usage: {
      input_tokens: 100, output_tokens: output, cache_read_input_tokens: 40,
      cache_creation_input_tokens: 10,
    } },
  });
  const records = parseClaudeUsage([
    message("m1", 1), message("m1", 20), message("m2", 100, { isSidechain: true }),
  ], "session-1");

  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    at: Date.parse("2026-09-24T09:00:00Z"), model: "claude-sonnet-4-5-20250929",
    inputTokens: 150, outputTokens: 20, cachedInputTokens: 40, cacheWriteTokens: 10,
  });
  const summary = summarizeUsageRecords(records);
  assert.equal(summary.inputTokens, 150);
  assert.equal(summary.outputTokens, 20);
  assert.equal(summary.cachedInputTokens, 40);
  assert.ok(summary.estimatedUsd > 0);
});

test("Codex usage subtracts cumulative records and starts a new segment after a reset", () => {
  const count = (at, input, cached, output) => ({
    type: "event_msg", timestamp: `2026-09-24T09:00:0${at}Z`, payload: {
      type: "token_count", info: { total_token_usage: {
        input_tokens: input, cached_input_tokens: cached, output_tokens: output,
      } },
    },
  });
  const records = parseCodexUsage([
    { type: "event_msg", payload: { type: "turn_context", model: "gpt-6-sol" } },
    count(1, 100, 20, 10), count(2, 150, 30, 15), count(3, 20, 5, 2),
  ]);

  const summary = summarizeUsageRecords(records);
  assert.equal(summary.inputTokens, 170);
  assert.equal(summary.cachedInputTokens, 35);
  assert.equal(summary.outputTokens, 17);
  assert.equal(records.length, 3);
  assert.ok(summary.estimatedUsd > 0);
});

test("Codex uses the last turn when a rollout starts with inherited cumulative counters", () => {
  const records = parseCodexUsage([
    { timestamp: "2026-09-28T09:00:00Z", payload: { type: "token_count", info: {
      total_token_usage: { input_tokens: 164_000_000, output_tokens: 500_000, cached_input_tokens: 150_000_000 },
      last_token_usage: { input_tokens: 70_000, output_tokens: 400, cached_input_tokens: 60_000 },
    } } },
    { timestamp: "2026-09-28T09:05:00Z", payload: { type: "token_count", info: {
      total_token_usage: { input_tokens: 164_080_000, output_tokens: 500_500, cached_input_tokens: 150_075_000 },
      last_token_usage: { input_tokens: 80_000, output_tokens: 500, cached_input_tokens: 75_000 },
    } } },
  ]);
  const summary = summarizeUsageRecords(records);

  assert.equal(summary.inputTokens, 150_000);
  assert.equal(summary.outputTokens, 900);
  assert.equal(summary.cachedInputTokens, 135_000);
  assert.equal(records[0].baselineSkipped, true);
});

test("unknown model prices stay unavailable instead of becoming zero cost", () => {
  const summary = summarizeUsageRecords([{ at: 1, model: "mimo-v2.5-pro", inputTokens: 100, outputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0 }]);
  assert.equal(summary.estimatedUsd, null);
  assert.equal(summary.pricedRecords, 0);
});

test("session totals include undated usage while date reports exclude it", () => {
  const records = [{ at: null, model: "gpt-6-sol", inputTokens: 20, outputTokens: 5, cachedInputTokens: 0, cacheWriteTokens: 0 }];
  const complete = summarizeUsageRecords(records);
  const dated = summarizeUsageRecords(records, { start: 0, end: 100 });
  assert.equal(complete.inputTokens, 20);
  assert.equal(complete.undatedRecords, 1);
  assert.equal(dated.measuredRecords, 0);
});
