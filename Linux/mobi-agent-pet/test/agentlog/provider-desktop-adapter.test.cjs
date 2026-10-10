"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createDesktopAdapter } = require("../../runtime/agentlog/providers/adapters/claude-desktop.cjs");

test("Claude Desktop direct switch writes four native files and preserves unrelated settings", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-desktop-"));
  try {
    const adapter = createDesktopAdapter({ fs, home });
    const configDir = path.join(home, ".config");
    const normal = path.join(configDir, "Claude", "claude_desktop_config.json");
    const threep = path.join(configDir, "Claude-3p", "claude_desktop_config.json");
    const meta = path.join(configDir, "Claude-3p", "configLibrary", "_meta.json");
    fs.mkdirSync(path.dirname(normal), { recursive: true });
    fs.mkdirSync(path.dirname(meta), { recursive: true });
    fs.writeFileSync(normal, '{"theme":"dark","deploymentMode":"1p"}');
    fs.writeFileSync(threep, '{"mcpServers":{"keep":{}}}');
    fs.writeFileSync(meta, '{"entries":[{"id":"other","name":"Other"}],"appliedId":"other"}');
    const changes = adapter.plan({ targetConfig: { mode: "direct", baseUrl: "https://api.test", apiKey: "secret", apiFormat: "anthropic" } });
    assert.equal(changes.length, 4);
    for (const change of changes) { fs.mkdirSync(path.dirname(change.path), { recursive: true }); fs.writeFileSync(change.path, change.nextBytes); }
    assert.equal(adapter.verify({ targetConfig: { mode: "direct", baseUrl: "https://api.test", apiKey: "secret", apiFormat: "anthropic" } }), true);
    assert.equal(JSON.parse(fs.readFileSync(normal)).theme, "dark");
    assert.equal(JSON.parse(fs.readFileSync(threep)).mcpServers.keep !== undefined, true);
    assert.equal(JSON.parse(fs.readFileSync(meta)).entries.length, 2);
    assert.equal(JSON.parse(fs.readFileSync(changes.find((change) => change.path.includes("00000000-")).path)).inferenceGatewayApiKey, "secret");
    const official = adapter.plan({ targetConfig: { mode: "direct", baseUrl: "", apiKey: "", apiFormat: "anthropic" } });
    for (const change of official) fs.writeFileSync(change.path, change.nextBytes);
    assert.equal(JSON.parse(fs.readFileSync(normal)).deploymentMode, "1p");
    assert.equal(JSON.parse(fs.readFileSync(meta)).entries.length, 1);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test("Claude Desktop rejects a proxy-only profile before writing", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-desktop-"));
  try {
    const adapter = createDesktopAdapter({ fs, home });
    assert.throws(() => adapter.plan({ targetConfig: { mode: "proxy", baseUrl: "https://api.test", apiKey: "secret" } }), /proxy/i);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
