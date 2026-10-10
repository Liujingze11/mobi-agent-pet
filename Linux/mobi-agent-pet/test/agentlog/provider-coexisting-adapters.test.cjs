"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createCoexistingAdapter } = require("../../runtime/agentlog/providers/adapters/coexisting.cjs");

const cases = [
  ["opencode", ".config/opencode/opencode.json", { npm: "@ai-sdk/openai-compatible", options: { baseURL: "https://a.test", apiKey: "k" }, models: {} }],
  ["openclaw", ".openclaw/openclaw.json", { baseUrl: "https://a.test", apiKey: "k", api: "openai-completions", models: [] }],
  ["hermes", ".hermes/config.yaml", { name: "Example", base_url: "https://a.test", api_key: "k", models: [{ id: "model" }] }],
  ["pi", ".pi/agent/models.json", { name: "Example", baseUrl: "https://a.test", apiKey: "k", models: [] }],
  ["mcode", ".minimax/config.yaml", { name: "Example", kind: "custom", enabled: true, api: "openai-completions", options: { baseURL: "https://a.test", apiKey: "k" }, models: {} }],
];

for (const [appId, relative, config] of cases) {
  test(`${appId} adds two native providers then removes only one`, () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), `mobi-${appId}-`));
    try {
      const adapter = createCoexistingAdapter(appId, { fs, home });
      assert.equal(adapter.read().path, path.join(home, relative));
      const first = adapter.planAdd({ providerId: "first", config, currentBytes: null });
      assert.equal(first.length, 1);
      fs.mkdirSync(path.dirname(first[0].path), { recursive: true });
      fs.writeFileSync(first[0].path, first[0].nextBytes);
      const second = adapter.planAdd({ providerId: "second", config, currentBytes: fs.readFileSync(first[0].path) });
      fs.writeFileSync(second[0].path, second[0].nextBytes);
      assert.equal(adapter.verify({ providerId: "first", enabled: true }), true);
      assert.equal(adapter.verify({ providerId: "second", enabled: true }), true);
      const removed = adapter.planRemove({ providerId: "first", currentBytes: fs.readFileSync(first[0].path) });
      fs.writeFileSync(removed[0].path, removed[0].nextBytes);
      assert.equal(adapter.verify({ providerId: "first", enabled: false }), true);
      assert.equal(adapter.verify({ providerId: "second", enabled: true }), true);
      assert.equal(adapter.planAdd({ providerId: "second", config, currentBytes: fs.readFileSync(first[0].path), allowExisting: true }).length, 0);
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
  });
}

test("malformed live config blocks a coexisting write", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-coexist-invalid-"));
  try {
    const adapter = createCoexistingAdapter("opencode", { fs, home });
    assert.throws(() => adapter.planAdd({ providerId: "new", config: {}, currentBytes: Buffer.from("{") }), /invalid/i);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
