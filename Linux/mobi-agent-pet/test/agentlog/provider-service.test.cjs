"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createProviderService, safeRequest } = require("../../runtime/agentlog/providers/service.cjs");

test("validates app IDs, deep payloads and never returns editable config from list", () => {
  const rows = new Map();
  const repository = {
    list: (scope) => [...rows.values()].filter((row) => row.appId === scope).map(({ settingsConfig, ...summary }) => summary),
    getDraft: (id) => rows.get(id) || null,
    create: (value) => { const row = { ...value, id: "one" }; rows.set("one", row); return { id: "one", appId: value.appId, name: value.name }; },
    update: (id, value) => { rows.set(id, { ...rows.get(id), ...value }); return { id, name: value.name }; },
    remove: (id) => rows.delete(id),
  };
  const service = createProviderService({ repository, fs: { existsSync: () => false }, paths: {} });
  const summary = service.create({ appId: "claude", name: "Kimi", settingsConfig: { env: { ANTHROPIC_AUTH_TOKEN: "secret" } } });
  assert.equal(summary.id, "one");
  assert.equal(JSON.stringify(service.list("claude")).includes("secret"), false);
  assert.equal(service.getEditDraft("one").settingsConfig.env.ANTHROPIC_AUTH_TOKEN, "secret");
  assert.throws(() => service.list("unknown"), /appId/i);
  let tooDeep = {};
  for (let index = 0; index < 14; index += 1) tooDeep = { nested: tooDeep };
  assert.throws(() => service.create({ appId: "claude", name: "deep", settingsConfig: tooDeep }), /config|depth/i);
});

test("missing live config gives an empty editor projection", () => {
  const service = createProviderService({ repository: { list: () => [] }, fs: { existsSync: () => false }, paths: { claude: "/missing/settings.json" } });
  assert.deepEqual(service.getEditorView("claude"), { appId: "claude", exists: false, config: null });
});

test("move validates ids before passing a reorder to storage", () => {
  const calls = [];
  const service = createProviderService({ repository: { move: (...args) => { calls.push(args); return []; } },
    fs: { existsSync: () => false } });
  service.move("first", "second");
  service.move("first", null);
  assert.deepEqual(calls, [["first", "second"], ["first", null]]);
  assert.throws(() => service.move("", null), /id/i);
});

test("existing live config never sends credentials to the editor", () => {
  const service = createProviderService({ repository: { list: () => [] },
    fs: { existsSync: () => true, readFileSync: () => '{"apiKey":"top-secret"}' },
    paths: { claude: "/example/settings.json" } });
  const view = service.getEditorView("claude");
  assert.equal(view.exists, true);
  assert.equal(JSON.stringify(view).includes("top-secret"), false);
});

test("model lookup honors an explicit models URL and private endpoints need opt-in", async () => {
  const requests = [];
  const service = createProviderService({ repository: { list: () => [] }, fs: {}, request: async (url, options) => {
    requests.push([url, options]);
    return { status: 200, body: JSON.stringify({ data: [{ id: "model-one" }] }) };
  } });
  assert.deepEqual(await service.fetchModels({ appId: "codex", endpoint: "https://example.com/custom/models", apiKey: "secret" }), ["model-one"]);
  assert.equal(requests[0][0], "https://example.com/custom/models");
  await assert.rejects(() => safeRequest("http://127.0.0.1:8912/models"), /HTTPS|private/i);
  await assert.rejects(() => safeRequest("https://127.0.0.1:8912/models"), /private/i);
});
