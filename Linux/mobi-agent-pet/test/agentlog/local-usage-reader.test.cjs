"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createLocalUsageReader } = require("../../runtime/agentlog/analytics/local-usage-reader.cjs");
const { makeSessionKey } = require("../../runtime/clawd/src/session-key.js");

test("local reader maps only local logs and reports missing sessions as uncovered", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-usage-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const claude = path.join(home, ".claude/projects/example/session-1.jsonl");
  const codexId = "01a05537-76f4-7203-96d7-9f1cdc3544c6";
  const codex = path.join(home, `.codex/sessions/2026/09/24/rollout-2026-09-24T01-00-00-${codexId}.jsonl`);
  fs.mkdirSync(path.dirname(claude), { recursive: true });
  fs.mkdirSync(path.dirname(codex), { recursive: true });
  fs.writeFileSync(claude, JSON.stringify({ type: "assistant", sessionId: "session-1", timestamp: "2026-09-24T01:00:00Z", message: { id: "m1", model: "claude-sonnet-4-5", content: "private", usage: { input_tokens: 10, output_tokens: 2 } } }) + "\n");
  fs.writeFileSync(codex, [
    { type: "turn_context", payload: { model: "gpt-6-sol" } },
    { type: "event_msg", timestamp: "2026-09-24T01:30:00Z", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 20, output_tokens: 4 } } } },
  ].map(JSON.stringify).join("\n") + "\n");
  const reader = createLocalUsageReader({ homeDir: home });
  const sessions = [
    { id: "claude", agentId: "claude-code", sourceSessionId: makeSessionKey({ rawSessionId: "session-1" }), transcriptPath: claude },
    { id: "codex", agentId: "codex", sourceSessionId: makeSessionKey({ rawSessionId: `codex:${codexId}` }), transcriptPath: null },
    { id: "missing", agentId: "claude-code", sourceSessionId: makeSessionKey({ rawSessionId: "missing" }), transcriptPath: path.join(home, ".claude/projects/example/missing.jsonl") },
  ];
  const start = Date.parse("2026-09-24T00:00:00Z");
  const end = Date.parse("2026-09-25T00:00:00Z");
  sessions[2].expectedInPeriod = true;
  const result = await reader.report(sessions, { start, end, boundaries: [start, start + 3_600_000, end] });
  assert.equal(result.usage.inputTokens, 30);
  assert.equal(result.usage.outputTokens, 6);
  assert.equal(result.usage.eligibleSessions, 3);
  assert.equal(result.usage.measuredSessions, 2);
  assert.equal(result.usage.pricedSessions, 2);
  assert.equal(result.usage.missingLogSessions, 1);
  assert.deepEqual(result.tokenBuckets.map((bucket) => bucket.inputTokens + bucket.outputTokens), [0, 36]);
  assert.equal((await reader.sessionSummary(sessions[0])).inputTokens, 10);
  assert.equal(await reader.sessionSummary(sessions[2]), null);
  assert.equal(JSON.stringify(result).includes("private"), false);
  fs.appendFileSync(claude, JSON.stringify({ type: "assistant", sessionId: "session-1", timestamp: "2026-09-24T02:00:00Z", message: { id: "m2", model: "unknown-proxy", usage: { input_tokens: 5, output_tokens: 1 } } }) + "\n");
  const changed = await reader.report(sessions, { start: Date.parse("2026-09-24T00:00:00Z"), end: Date.parse("2026-09-25T00:00:00Z") });
  assert.equal(changed.usage.inputTokens, 35);
  assert.equal(changed.usage.pricedSessions, 1);
});

test("Codex cumulative counters are assigned by increment timestamp across midnight", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-usage-midnight-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const id = "01a05537-76f4-7203-96d7-9f1cdc3544c6";
  const file = path.join(home, ".codex/sessions/2026/09/24/rollout-2026-09-24T23-00-00-" + id + ".jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const count = (timestamp, input, output) => ({ timestamp, payload: { type: "token_count", info: {
    total_token_usage: { input_tokens: input, output_tokens: output },
  } } });
  fs.writeFileSync(file, [
    count("2026-09-24T23:55:00Z", 100, 10),
    count("2026-09-25T00:05:00Z", 150, 15),
  ].map(JSON.stringify).join("\n") + "\n");
  const reader = createLocalUsageReader({ homeDir: home });
  const start = Date.parse("2026-09-25T00:00:00Z");
  const end = Date.parse("2026-09-26T00:00:00Z");
  const result = await reader.report([{ id: "codex", agentId: "codex", sourceSessionId: makeSessionKey({ rawSessionId: "codex:" + id }), transcriptPath: null, expectedInPeriod: false }], {
    start, end, boundaries: [start, start + 3_600_000, end],
  });

  assert.equal(result.usage.inputTokens, 50);
  assert.equal(result.usage.outputTokens, 5);
  assert.deepEqual(result.tokenBuckets.map((bucket) => bucket.inputTokens + bucket.outputTokens), [55, 0]);
  assert.equal(result.usage.eligibleSessions, 1);

  const later = await reader.report([{ id: "codex", agentId: "codex", sourceSessionId: makeSessionKey({ rawSessionId: "codex:" + id }), transcriptPath: null, expectedInPeriod: false }], {
    start: end, end: end + 86_400_000,
  });
  assert.equal(later.sessionUsage.codex.inputTokens, 150);
});

test("a Codex rollout with inherited counters counts only its recorded turns", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-usage-inherited-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const id = "01a05537-76f4-7203-96d7-9f1cdc3544c6";
  const file = path.join(home, `.codex/sessions/2026/09/28/rollout-2026-09-28T09-00-00-${id}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const count = (timestamp, totalInput, totalOutput, lastInput, lastOutput) => ({ timestamp, payload: { type: "token_count", info: {
    total_token_usage: { input_tokens: totalInput, output_tokens: totalOutput },
    last_token_usage: { input_tokens: lastInput, output_tokens: lastOutput },
  } } });
  fs.writeFileSync(file, [
    count("2026-09-28T09:00:00Z", 165_000_000, 50_000, 70_000, 5),
    count("2026-09-28T09:05:00Z", 165_080_000, 50_050, 80_000, 50),
  ].map(JSON.stringify).join("\n") + "\n");
  const reader = createLocalUsageReader({ homeDir: home });
  const start = Date.parse("2026-09-28T00:00:00Z");
  const end = Date.parse("2026-09-29T00:00:00Z");
  const result = await reader.report([{ id: "codex", agentId: "codex", sourceSessionId: makeSessionKey({ rawSessionId: `codex:${id}` }), transcriptPath: null }], {
    start, end, boundaries: [start, end],
  });

  assert.equal(result.usage.inputTokens, 150_000);
  assert.equal(result.usage.outputTokens, 55);
  assert.equal(result.tokenBuckets[0].inputTokens, 150_000);
});

test("forced report rereads a changed log even when size and mtime match", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-usage-refresh-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const file = path.join(home, ".claude/projects/example/session-1.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const entry = (input) => JSON.stringify({ type: "assistant", sessionId: "session-1", timestamp: "2026-09-28T09:00:00Z", message: {
    id: "m1", model: "claude-sonnet-4-5", usage: { input_tokens: input, output_tokens: 2 },
  } }) + "\n";
  fs.writeFileSync(file, entry(10));
  const stamp = new Date("2026-09-28T09:00:00Z");
  fs.utimesSync(file, stamp, stamp);
  const session = { id: "claude", agentId: "claude-code", sourceSessionId: makeSessionKey({ rawSessionId: "session-1" }), transcriptPath: file };
  const reader = createLocalUsageReader({ homeDir: home });
  const range = { start: Date.parse("2026-09-28T00:00:00Z"), end: Date.parse("2026-09-29T00:00:00Z") };
  assert.equal((await reader.report([session], range)).usage.inputTokens, 10);

  const original = fs.statSync(file);
  fs.writeFileSync(file, entry(20));
  fs.utimesSync(file, original.atime, original.mtime);
  assert.equal(fs.statSync(file).size, original.size);
  assert.equal(fs.statSync(file).mtimeMs, original.mtimeMs);
  assert.equal((await reader.report([session], range)).usage.inputTokens, 10);
  assert.equal((await reader.report([session], { ...range, force: true })).usage.inputTokens, 20);
});

test("forced report discovers a new Codex rollout before the index expires", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-usage-new-rollout-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const id = "01a05537-76f4-7203-96d7-9f1cdc3544c6";
  const file = path.join(home, `.codex/sessions/2026/09/28/rollout-2026-09-28T09-00-00-${id}.jsonl`);
  const reader = createLocalUsageReader({ homeDir: home, now: () => 1_000 });
  const session = { id: "codex", agentId: "codex", sourceSessionId: makeSessionKey({ rawSessionId: `codex:${id}` }), transcriptPath: null };
  const range = { start: Date.parse("2026-09-28T00:00:00Z"), end: Date.parse("2026-09-29T00:00:00Z") };

  assert.equal((await reader.report([session], range)).usage.inputTokens, null);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ timestamp: "2026-09-28T09:00:00Z", payload: {
    type: "token_count", info: { total_token_usage: { input_tokens: 42, output_tokens: 3 } },
  } }) + "\n");
  assert.equal((await reader.report([session], range)).usage.inputTokens, null);
  assert.equal((await reader.report([session], { ...range, force: true })).usage.inputTokens, 42);
});

test("a transcript read error marks observed Token coverage as incomplete", async () => {
  const home = path.join(os.tmpdir(), "mobi-unreadable-usage");
  const file = path.join(home, ".claude/projects/example/session-1.jsonl");
  const fileSystem = {
    promises: {
      stat: async () => ({ isFile: () => true, size: 10, mtimeMs: 1 }),
      realpath: async () => file,
    },
    createReadStream: () => { throw new Error("unreadable"); },
  };
  const reader = createLocalUsageReader({ homeDir: home, fileSystem });
  const result = await reader.report([{ id: "claude", agentId: "claude-code", sourceSessionId: makeSessionKey({ rawSessionId: "session-1" }), transcriptPath: file, expectedInPeriod: true }], {
    start: 0, end: 10, boundaries: [0, 10],
  });

  assert.equal(result.usage.missingLogSessions, 1);
  assert.equal(result.usage.inputTokens, null);
});
