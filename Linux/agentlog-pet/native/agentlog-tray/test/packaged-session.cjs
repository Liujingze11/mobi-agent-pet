"use strict";

const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const root = path.resolve(__dirname, "../../..");
const { stopChild, stopPid } = require(path.join(root, "scripts/smoke-process.cjs"));
const { i18n } = require(path.join(root, "runtime/clawd/src/i18n.js"));

function bus(...args) {
  const output = execFileSync("busctl", ["--user", "--json=short", "--timeout=3", "--", ...args], {
    encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "pipe"],
  });
  return output.trim() ? JSON.parse(output).data : null;
}

function registeredItems() {
  return bus("get-property", "org.kde.StatusNotifierWatcher", "/StatusNotifierWatcher",
    "org.kde.StatusNotifierWatcher", "RegisteredStatusNotifierItems").sort();
}

async function until(read, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = read();
      if (result) return result;
    } catch (error) {
      if (error.code === "ERR_ASSERTION") throw error;
      lastError = error;
    }
    await sleep(100);
  }
  throw lastError || new Error("Desktop probe timed out");
}

function endpoint(item) {
  const slash = item.indexOf("/");
  if (slash < 0) return [item, "/StatusNotifierItem"];
  return [item.slice(0, slash), item.slice(slash)];
}

function isLiveItem(item) {
  const [service, itemPath] = endpoint(item);
  if (!bus("call", "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus",
    "NameHasOwner", "s", service)[0]) return false;
  try {
    bus("call", service, itemPath, "org.freedesktop.DBus.Properties",
      "GetAll", "s", "org.kde.StatusNotifierItem");
    return true;
  } catch (error) {
    // Electron keeps its bus connection after destroying the tray object.
    if (/Method is no longer available|Unknown(Method|Object|Interface)|does not exist|not provided by any \.service/.test(error.stderr || "")) return false;
    throw error;
  }
}

function unbox(value) { return value && value.data !== undefined ? value.data : value; }
function properties(dict) {
  return Object.fromEntries(Object.entries(dict).map(([key, value]) => [key, unbox(value)]));
}

function layout(item) {
  const [service, itemPath] = endpoint(item);
  const result = bus("call", service, `${itemPath}/Menu`, "com.canonical.dbusmenu",
    "GetLayout", "iias", "0", "-1", "0");
  const nodes = [];
  function visit(node) {
    const [id, props, children] = unbox(node);
    nodes.push({ id, ...properties(props) });
    children.forEach(visit);
  }
  visit(result[1]);
  return nodes;
}

function click(item, label) {
  const entry = layout(item).find((node) => node.label === label);
  assert.ok(entry, `Missing menu entry: ${label}`);
  assert.notEqual(entry.enabled, false);
  const [service, itemPath] = endpoint(item);
  bus("call", service, `${itemPath}/Menu`, "com.canonical.dbusmenu", "Event",
    "isvu", String(entry.id), "clicked", "i", "0", "0");
}

async function main() {
  assert.ok(process.argv[2], "Pass an extracted-deb executable or AppImage path");
  const executable = path.resolve(process.argv[2]);
  fs.accessSync(executable, fs.constants.X_OK);
  const baseline = registeredItems();
  const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-tray-session-"));
  const env = { ...process.env, HOME: isolatedHome, XDG_CONFIG_HOME: path.join(isolatedHome, ".config"),
    CLAWD_SKIP_SIDECAR_FETCH: "1", CLAWD_OZONE_PLATFORM: "x11", AGENTLOG_SMOKE_MODE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.LD_LIBRARY_PATH;
  delete env.PKG_CONFIG_PATH;
  let child;
  let appPid;
  let spawnError;
  let output = "";
  const report = { executable, checks: [] };
  function pass(check) {
    report.checks.push(check);
    process.stdout.write(`PASS ${check}\n`);
  }
  try {
    child = spawn(executable, ["--ozone-platform=x11"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", (error) => { spawnError = error; });
    const ready = await until(() => {
      assert.ifError(spawnError);
      const line = output.split(/\r?\n/).find((entry) => entry.startsWith("AGENTLOG_SMOKE_READY "));
      return line && JSON.parse(line.slice("AGENTLOG_SMOKE_READY ".length));
    }, 20000);
    appPid = ready.pid;
    assert.deepEqual(ready.tray, { status: "native", code: null });
    report.ready = ready;
    const added = registeredItems().filter((item) => !baseline.includes(item));
    assert.equal(added.length, 1);
    let item = added[0];
    assert.ok(item.endsWith("/com_agentlog_pet_tray"));
    const [service, itemPath] = endpoint(item);
    const props = properties(bus("call", service, itemPath, "org.freedesktop.DBus.Properties",
      "GetAll", "s", "org.kde.StatusNotifierItem")[0]);
    for (const [key, expected] of Object.entries({ Id: "com.agentlog.pet.tray", Title: "AgentLog Pet",
      Status: "Active", IconName: "agentlog-pet" })) assert.equal(props[key], expected);
    report.tray = Object.fromEntries(["Id", "Title", "Status", "IconName", "IconThemePath", "Menu"].map((key) => [key, props[key]]));
    const helperPid = bus("call", "org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus",
      "GetConnectionUnixProcessID", "s", service)[0];
    const helper = fs.readlinkSync(`/proc/${helperPid}/exe`);
    assert.equal(path.basename(helper), "agentlog-tray");
    assert.match(fs.readFileSync(`/proc/${helperPid}/status`, "utf8"), new RegExp(`PPid:\\s+${appPid}\\n`));
    assert.equal(props.IconThemePath, path.resolve(path.dirname(helper), "../icons/hicolor"));
    for (const size of [16, 22, 32, 48]) {
      for (const name of ["agentlog-pet", "agentlog-pet-attention"]) {
        const png = fs.readFileSync(path.join(props.IconThemePath, `${size}x${size}`, "status", `${name}.png`));
        assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(png.readUInt32BE(16), size);
        assert.equal(png.readUInt32BE(20), size);
      }
    }
    pass("one native item, packaged icon theme, eight sized PNGs, app-owned helper");
    report.menu = layout(item);
    const labels = report.menu.some((node) => node.label === i18n.zh.appModeNormal) ? i18n.zh : i18n.en;
    bus("call", service, `${itemPath}/Menu`, "com.canonical.dbusmenu", "AboutToShow", "i", "0");
    for (const label of [labels.appModeBackground, labels.appModeNormal]) {
      click(item, label);
      await until(() => layout(item).some((node) => node.label === label && node["toggle-state"] === 1));
      pass(`mode command and state refresh: ${label}`);
    }
    click(item, labels.hidePet);
    await until(() => layout(item).some((node) => node.label === labels.showPet));
    click(item, labels.showPet);
    await until(() => layout(item).some((node) => node.label === labels.hidePet));
    pass("hide/show pet menu round trip");

    process.kill(helperPid, "SIGKILL");
    item = await until(() => {
      // Watcher removal notifications can lag behind object destruction.
      const delta = registeredItems().filter((entry) => !baseline.includes(entry)).filter(isLiveItem);
      assert.ok(delta.length <= 1, "duplicate live tray objects during recovery");
      return delta.length === 1 && delta[0] !== item && delta[0].endsWith("/com_agentlog_pet_tray") && delta[0];
    });
    assert.ok(layout(item).some((node) => node.label === labels.appModeNormal && node["toggle-state"] === 1));
    assert.ok(!fs.existsSync(`/proc/${helperPid}`));
    pass("killed helper recovered; no duplicate live tray object sampled during recovery");
    click(item, labels.quit);
    await until(() => !fs.existsSync(`/proc/${appPid}`));
    await until(() => JSON.stringify(registeredItems()) === JSON.stringify(baseline));
    pass("Quit exits app and restores watcher baseline");
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    try {
      if (appPid && fs.existsSync(`/proc/${appPid}`)) await stopPid(appPid);
      if (child && child.pid && child.exitCode === null && child.signalCode === null) await stopChild(child);
    } finally {
      fs.rmSync(isolatedHome, { recursive: true, force: true });
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
