"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { parse } = require("smol-toml");
const { createGrokAdapter } = require("../../runtime/agentlog/providers/adapters/grokbuild.cjs");

test("Grok Build converts CC Switch preset to a native model table and retains MCP", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-grok-"));
  try {
    const adapter = createGrokAdapter({ fs, home });
    const source = Buffer.from('# keep\n[mcp_servers.local]\ncommand = "hook"\n');
    const targetConfig = { auth: { OPENAI_API_KEY: "secret" },
      config: 'model_provider = "custom"\nmodel = "grok-4.5"\n[model_providers.custom]\nname = "Relay"\nbase_url = "https://relay.test/v1"\nwire_api = "responses"' };
    const [change] = adapter.plan({ currentBytes: source, targetConfig });
    const text = change.nextBytes.toString();
    const doc = parse(text);
    assert.equal(doc.models.default, "mobi-grok");
    assert.equal(doc.model["mobi-grok"].api_key, "secret");
    assert.equal(doc.model["mobi-grok"].base_url, "https://relay.test/v1");
    assert.match(text, /mcp_servers\.local/);
    assert.match(text, /# keep/);
    const official = adapter.plan({ currentBytes: change.nextBytes, previousConfig: targetConfig, targetConfig: { auth: {}, config: "" } });
    const officialDoc = parse(official[0].nextBytes.toString());
    assert.equal(officialDoc.model?.["mobi-grok"], undefined);
    assert.equal(officialDoc.models?.default, undefined);
    assert.equal(officialDoc.mcp_servers.local.command, "hook");
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
