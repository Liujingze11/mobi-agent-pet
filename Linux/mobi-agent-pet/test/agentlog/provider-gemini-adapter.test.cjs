"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createGeminiAdapter } = require("../../runtime/agentlog/providers/adapters/gemini.cjs");

test("Gemini switches env and auth type while preserving user settings and comments", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-gemini-"));
  try {
    const adapter = createGeminiAdapter({ fs, home });
    const env = Buffer.from("# keep\nGEMINI_SANDBOX=docker\nGEMINI_API_KEY=old\nDEBUG=1\n");
    const settings = Buffer.from('{\n  // keep\n  "security": {"auth": {"selectedType": "oauth-personal", "useExternal": true}},\n  "model": {"name": "old", "compressionThreshold": 0.5},\n  "mcpServers": {"x": {"command": "y"}}\n}\n');
    const changes = adapter.plan({ currentBytes: { env, settings }, targetConfig: {
      env: { GEMINI_API_KEY: "new", GOOGLE_GEMINI_BASE_URL: "https://example.test" },
      config: { model: { name: "new-model" } },
    } });
    assert.equal(changes.length, 2);
    const nextEnv = changes.find((change) => change.path.endsWith(".env")).nextBytes.toString();
    const nextSettings = changes.find((change) => change.path.endsWith("settings.json")).nextBytes.toString();
    assert.match(nextEnv, /GEMINI_SANDBOX=docker/);
    assert.match(nextEnv, /# keep/);
    assert.doesNotMatch(nextEnv, /GEMINI_API_KEY=old/);
    assert.match(nextEnv, /GEMINI_API_KEY=new/);
    assert.match(nextSettings, /mcpServers/);
    assert.match(nextSettings, /compressionThreshold/);
    assert.match(nextSettings, /useExternal/);
    assert.match(nextSettings, /gemini-api-key/);
    assert.match(nextSettings, /new-model/);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test("Gemini official profile clears provider env and selects Google login", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-gemini-"));
  try {
    const adapter = createGeminiAdapter({ fs, home });
    const changes = adapter.plan({ currentBytes: { env: Buffer.from("GEMINI_API_KEY=old\nUSER=keep\n"),
      settings: Buffer.from('{"security":{"auth":{"selectedType":"gemini-api-key"}}}') },
    targetConfig: { env: {} } });
    assert.equal(changes.find((change) => change.path.endsWith(".env")).nextBytes.toString(), "USER=keep\n");
    assert.match(changes.find((change) => change.path.endsWith("settings.json")).nextBytes.toString(), /oauth-personal/);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
