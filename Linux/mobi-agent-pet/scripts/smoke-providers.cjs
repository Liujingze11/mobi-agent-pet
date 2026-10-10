"use strict";

// Exercise the real renderer/preload/main-process path with disposable data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const WebSocket = require("ws");
const { stopChild } = require("./smoke-process.cjs");
const { ensureElectronBinding } = require("./prepare-electron-native.cjs");

const root = path.resolve(__dirname, "..");
const home = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-provider-smoke-"));
const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"),
  CLAWD_SKIP_SIDECAR_FETCH: "1", CLAWD_OZONE_PLATFORM: "x11", AGENTLOG_MANAGER_SMOKE_MODE: "1",
  AGENTLOG_BETTER_SQLITE3_BINDING: ensureElectronBinding() };
for (const key of ["ELECTRON_RUN_AS_NODE", "CODEX_HOME", "CLAUDE_CONFIG_DIR", "GEMINI_CLI_HOME"]) delete env[key];
let child;
let socket;
let sequence = 0;
const pending = new Map();

async function launch() {
  child = spawn(require("electron"), ["--remote-debugging-port=0", "--ozone-platform=x11", root],
    { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  const address = await new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Provider smoke startup timeout")), 25000);
    const inspect = (chunk) => {
      output += chunk.toString();
      const debuggerMatch = output.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/);
      const ready = output.match(/AGENTLOG_MANAGER_SMOKE_READY (.+)/);
      if (output.includes("AGENTLOG_MANAGER_SMOKE_ERROR")) {
        clearTimeout(timeout); reject(new Error("Provider smoke renderer startup failed")); return;
      }
      if (debuggerMatch && ready) {
        clearTimeout(timeout);
        assert.equal(JSON.parse(ready[1]).managerShell, true);
        resolve(new URL(debuggerMatch[1]));
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Provider smoke exited: ${code}`)); });
  });
  const response = await fetch(`http://${address.host}/json/list`);
  const targets = await response.json();
  const target = targets.find((entry) => entry.url.includes("/dist/manager/index.html"));
  assert.ok(target, "manager renderer target exists");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    const item = pending.get(message.id);
    if (!item) return;
    clearTimeout(item.timeout);
    pending.delete(message.id);
    if (message.error) item.reject(new Error("Provider smoke debugger command failed"));
    else item.resolve(message.result);
  });
}

function command(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error("Provider smoke command timeout")); }, 15000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || "Provider smoke renderer check failed");
  return result.result.value;
}

async function stop() {
  if (socket) { socket.close(); socket = null; }
  await stopChild(child);
  child = null;
}

(async () => {
  try {
    await launch();
    const created = await evaluate(`(async () => {
      const api = window.agentLog.providers;
      const official = await api.create({ appId: "claude", presetId: "claude:001", name: "Smoke Official",
        websiteUrl: "", settingsConfig: { env: {} }, activation: "available", unavailableReason: null, metadata: {} });
      const keyed = await api.create({ appId: "opencode", presetId: null, name: "Smoke Gateway", websiteUrl: "",
        settingsConfig: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "https://smoke.example/v1",
          apiKey: "mobi-disposable-smoke-key" }, models: { "smoke-model": { name: "Smoke Model" } } },
        activation: "available", unavailableReason: null, metadata: { providerKey: "smoke-gateway" } });
      const summaries = await api.list("opencode");
      if (JSON.stringify(summaries).includes("mobi-disposable-smoke-key")) throw new Error("Credential in list response");
      const exported = await api.exportData();
      if (JSON.stringify(exported).includes("mobi-disposable-smoke-key")) throw new Error("Credential in public export");
      return { official: official.id, keyed: keyed.id };
    })()`);
    const liveFile = path.join(home, ".config", "opencode", "opencode.json");
    assert.equal(fs.existsSync(liveFile), false, "saving does not activate a provider");
    await stop();
    await launch();
    const checked = await evaluate(`(async () => {
      const api = window.agentLog.providers;
      const draft = await api.getEditDraft(${JSON.stringify(created.keyed)});
      if (draft.settingsConfig.options.apiKey !== "mobi-disposable-smoke-key") throw new Error("Encrypted credential did not survive restart");
      await api.update({ ...draft, id: ${JSON.stringify(created.keyed)}, name: "Smoke Renamed" });
      const enabled = await api.addToLive(${JSON.stringify(created.keyed)});
      const official = await api.list("claude");
      const exported = await api.exportData();
      const imported = await api.importData(exported);
      return { enabled: enabled.enabledIds.includes(${JSON.stringify(created.keyed)}),
        officialSurvived: official.some((row) => row.id === ${JSON.stringify(created.official)}),
        duplicateImports: imported.added };
    })()`);
    assert.deepEqual(checked, { enabled: true, officialSurvived: true, duplicateImports: 0 });
    assert.equal(JSON.parse(fs.readFileSync(liveFile)).provider["smoke-gateway"].models["smoke-model"].name, "Smoke Model");
    const tabs = await evaluate(`(async () => {
      document.querySelector(".toolbar__tabs button:last-child").click();
      const deadline = Date.now() + 5000;
      while (!document.querySelector('[aria-label="供应商管理"] [role="tab"]')) {
        if (Date.now() > deadline) throw new Error("Supplier page did not open");
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return [...document.querySelectorAll('[aria-label="供应商管理"] [role="tab"]')].map(node => node.textContent);
    })()`);
    assert.deepEqual(tabs, ["Claude Code", "Claude Desktop", "OpenAI"]);
    if (process.env.MOBI_PROVIDER_SMOKE_SCREENSHOT) {
      await evaluate(`(async () => {
        const api = window.agentLog.providers;
        const original = await api.getEditDraft(${JSON.stringify(created.official)});
        await api.update({ ...original, id: ${JSON.stringify(created.official)}, name: "Claude 官方" });
        const kimi = await api.create({ appId: "claude", name: "Kimi", presetId: "claude:002", websiteUrl: "",
          activation: "available", unavailableReason: null, metadata: {}, settingsConfig: { env: {
            ANTHROPIC_BASE_URL: "https://api.moonshot.cn/anthropic", ANTHROPIC_AUTH_TOKEN: "disposable-screenshot-key",
            ANTHROPIC_MODEL: "kimi-k2.7-code" } } });
        await api.create({ appId: "claude", name: "团队 API", presetId: null, websiteUrl: "",
          activation: "available", unavailableReason: null, metadata: {}, settingsConfig: { env: {
            ANTHROPIC_BASE_URL: "https://gateway.example.com/v1", ANTHROPIC_AUTH_TOKEN: "disposable-screenshot-key",
            ANTHROPIC_MODEL: "claude-sonnet-5", ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-5" } } });
        await api.activate(kimi.id);
        const deadline = Date.now() + 5000;
        while (document.querySelectorAll(".provider-card").length !== 3 || !document.querySelector(".provider-card--current")) {
          if (Date.now() > deadline) throw new Error("Supplier preview did not update");
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        return true;
      })()`);
      const output = path.resolve(process.env.MOBI_PROVIDER_SMOKE_SCREENSHOT);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      await command("Emulation.setDeviceMetricsOverride", { width: 1160, height: 760, deviceScaleFactor: 1, mobile: false });
      const desktop = await command("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(output, Buffer.from(desktop.data, "base64"));
      await command("Emulation.setDeviceMetricsOverride", { width: 640, height: 860, deviceScaleFactor: 1, mobile: false });
      const compact = await command("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(output.replace(/\.png$/, "-compact.png"), Buffer.from(compact.data, "base64"));
      await evaluate(`(async () => {
        const api = window.agentLog.providers;
        await api.restoreOriginal("claude");
        for (const row of await api.list("claude")) if (row.id !== ${JSON.stringify(created.official)}) await api.remove(row.id);
        return true;
      })()`);
    }
    await evaluate(`(async () => {
      const api = window.agentLog.providers;
      await api.removeFromLive(${JSON.stringify(created.keyed)});
      await api.remove(${JSON.stringify(created.keyed)});
      await api.remove(${JSON.stringify(created.official)});
      if ((await api.list("opencode")).length || (await api.list("claude")).length) throw new Error("Provider delete failed");
      return true;
    })()`);
    assert.equal(JSON.parse(fs.readFileSync(liveFile)).provider["smoke-gateway"], undefined);
    process.stdout.write(JSON.stringify({ status: "ok", rendererIpc: true, encryptedRestart: true,
      nativeConfigKey: true, importExport: true, editDelete: true, threeAgentTabs: true }) + "\n");
  } finally {
    await stop();
    fs.rmSync(home, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
