"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const productMain = fs.readFileSync(path.join(root, "runtime/agentlog/main.cjs"), "utf8");
const upstreamMain = fs.readFileSync(path.join(root, "runtime/clawd/src/main.js"), "utf8");

test("root package exposes one AgentLog Pet Electron application", () => {
  assert.equal(pkg.name, "agentlog-pet");
  assert.equal(pkg.productName, "AgentLog Pet");
  assert.equal(pkg.desktopName, "agentlog-pet.desktop");
  assert.equal(pkg.main, "runtime/agentlog/main.cjs");
  assert.equal(pkg.engines.node, ">=22.12.0");
  assert.equal(pkg.homepage, "https://github.com/Liujingze11/agentlog-pet");
  assert.equal(pkg.build.appId, "com.agentlog.pet");
  assert.equal(pkg.build.productName, "AgentLog Pet");
  assert.equal(
    pkg.build.linux.artifactName,
    "AgentLog-Pet-${version}-x64.${ext}"
  );
  assert.deepEqual(pkg.build.linux.target, [
    { target: "AppImage", arch: ["x64"] },
    { target: "deb", arch: ["x64"] },
  ]);
  assert.equal(pkg.build.linux.icon, "assets/brand/icons");
  assert.ok(pkg.build.files.includes("assets/brand/**/*"));
  assert.deepEqual(pkg.build.extraResources, [
    { from: "assets/brand/icon.png", to: "icon.png" },
  ]);
  for (const size of [16, 32, 48, 64, 128, 256, 512]) {
    assert.equal(
      fs.existsSync(path.join(root, "assets", "brand", "icons", `${size}x${size}.png`)),
      true,
      `missing ${size}x${size} brand icon`
    );
  }
  for (const size of [256, 512]) {
    const digest = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
    assert.equal(
      digest(path.join(root, "runtime", "clawd", "pwa", "icons", `icon-${size}.png`)),
      digest(path.join(root, "assets", "brand", "icons", `${size}x${size}.png`)),
      `PWA ${size}px icon must be a product brand export`
    );
  }
  assert.equal(pkg.build.linux.syncDesktopName, true);
  assert.equal(
    pkg.build.publish[0].repo,
    "agentlog-pet"
  );
  assert.equal(pkg.dependencies["better-sqlite3"], "12.11.1");
  assert.ok(pkg.build.files.includes("dist/manager/**/*"));
  assert.ok(pkg.build.asarUnpack.includes("node_modules/better-sqlite3/**/*"));
  assert.equal(pkg.build.npmRebuild, false);
  assert.match(pkg.scripts["prebuild:linux"], /build:manager/);
  assert.equal(pkg.scripts["smoke:manager"], "node scripts/smoke-manager.cjs");
  assert.equal(fs.existsSync(path.join(root, "electron-builder.yml")), false);
});

test("the selected brand is the only application logo source", () => {
  const legacyLogoPaths = [
    "docs/design/icon-concepts",
    "runtime/clawd/assets/icon.png",
    "runtime/clawd/assets/icon.ico",
    "runtime/clawd/assets/dock-icon.png",
    "runtime/clawd/assets/source/dock-icon-fullbleed.png",
    "runtime/clawd/assets/tray-icon.png",
    "runtime/clawd/assets/tray-iconTemplate.png",
    "runtime/clawd/assets/tray-iconTemplate@2x.png",
    "runtime/clawd/assets/svg/clawd-about-hero.svg",
  ];
  for (const relativePath of legacyLogoPaths) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), false, `legacy logo remains: ${relativePath}`);
  }

  const runtimeSources = [
    "runtime/clawd/src/main.js",
    "runtime/clawd/src/menu.js",
    "runtime/clawd/src/settings-ipc.js",
    "runtime/clawd/src/settings-tab-about.js",
    "runtime/clawd/src/tutorial-renderer.js",
  ].map((relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8")).join("\n");
  assert.doesNotMatch(runtimeSources, /clawd-about-hero|dock-icon|tray-iconTemplate|tray-icon\.png|assets["', )]+icon\.png/);
  assert.match(runtimeSources, /assets["', )]+brand/);
});

test("legacy DevPulse main remains source-only and is not packaged as an entry", () => {
  assert.notEqual(pkg.main, "dist-electron/main.js");
  assert.equal(pkg.build.files.includes("dist-electron/**/*"), false);
});

test("the product wrapper delegates lifecycle ownership to one pinned runtime", () => {
  assert.ok(productMain.indexOf("app.setName") < productMain.indexOf("../clawd/src/main.js"));
  assert.ok(productMain.indexOf("agentLogApp.install()") < productMain.indexOf("../clawd/src/main.js"));
  assert.doesNotMatch(productMain, /\bnew Tray\b|\bnew BrowserWindow\b/);
  assert.equal(
    (upstreamMain.match(/app\.requestSingleInstanceLock\(\)/g) || []).length,
    1
  );
});

test("the pinned main passes the AgentLog manager action into the real menu context", () => {
  const contextStart = upstreamMain.indexOf("const _menuCtx = {");
  const contextEnd = upstreamMain.indexOf("\nconst trayRuntime = createTrayRuntime(", contextStart);
  assert.ok(contextStart >= 0 && contextEnd > contextStart, "main should construct the menu context");
  const menuContext = upstreamMain.slice(contextStart, contextEnd);

  assert.match(
    menuContext,
    /openAgentLogManager:\s*\(\)\s*=>\s*agentLogApp\.showManager\(\)/
  );
});

test("smoke mode reports the ready AgentLog Pet window without owning its lifecycle", () => {
  const writes = [];
  let readyCallback;
  let timerUnrefCalled = false;
  let agentLogInstallCalls = 0;
  const fakeApp = {
    setName(name) {
      this.name = name;
    },
    getName() {
      return this.name;
    },
    whenReady() {
      return {
        then(callback) {
          readyCallback = callback;
        },
      };
    },
  };

  const context = vm.createContext({
    __dirname: path.join(root, "runtime", "agentlog"),
    process: {
      env: { AGENTLOG_SMOKE_MODE: "1" },
      pid: 4242,
      stdout: {
        write(value) {
          writes.push(value);
        },
      },
    },
    require(request) {
      if (request === "electron") {
        return {
          app: fakeApp,
          BrowserWindow: {
            getAllWindows() {
              return [{ id: 1 }];
            },
          },
        };
      }
      if (request === "./brand.cjs") {
        return { BRAND: { productName: "AgentLog Pet" } };
      }
      if (request === "./app-runtime.cjs") {
        return { install() { agentLogInstallCalls += 1; } };
      }
      if (request === "../clawd/src/main.js") return {};
      throw new Error(`Unexpected require: ${request}`);
    },
    setTimeout(callback) {
      callback();
      return {
        unref() {
          timerUnrefCalled = true;
        },
      };
    },
  });

  vm.runInContext(productMain, context, { filename: "runtime/agentlog/main.cjs" });
  assert.equal(agentLogInstallCalls, 1);
  assert.equal(typeof readyCallback, "function");
  readyCallback();

  assert.equal(timerUnrefCalled, true);
  assert.deepEqual(writes, [
    'AGENTLOG_SMOKE_READY {"productName":"AgentLog Pet","windowCount":1,"pid":4242}\n',
  ]);
});

test("manager smoke mode opens the real manager and reports only safe rendered metadata", async () => {
  const writes = [];
  let readyCallback;
  let didFinishLoad;
  let executeSource;
  const manager = {
    getTitle: () => "AgentLog Pet",
    webContents: {
      once(event, callback) {
        assert.equal(event, "did-finish-load");
        didFinishLoad = callback;
      },
      executeJavaScript(source) {
        executeSource = source;
        return Promise.resolve(true);
      },
    },
  };
  const fakeApp = {
    setName(name) { this.name = name; },
    getName() { return this.name; },
    whenReady() {
      return { then(callback) { readyCallback = callback; } };
    },
  };
  const agentLogApp = {
    getServices: () => ({ database: { name: "/private/user/data/agentlog.db" } }),
    install() {},
    openManager: () => manager,
  };
  const context = vm.createContext({
    __dirname: path.join(root, "runtime", "agentlog"),
    console,
    process: {
      pid: 4242,
      env: { AGENTLOG_MANAGER_SMOKE_MODE: "1" },
      stdout: { write: (value) => writes.push(value) },
    },
    require(request) {
      if (request === "node:path") return path;
      if (request === "electron") return { app: fakeApp };
      if (request === "./brand.cjs") return { BRAND: { productName: "AgentLog Pet" } };
      if (request === "./app-runtime.cjs") return agentLogApp;
      if (request === "../clawd/src/main.js") return {};
      throw new Error(`Unexpected require: ${request}`);
    },
  });

  vm.runInContext(productMain, context, { filename: "runtime/agentlog/main.cjs" });
  readyCallback();
  didFinishLoad();
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(executeSource, /data-testid=['"]manager-shell['"]/);
  assert.deepEqual(writes, [
    'AGENTLOG_MANAGER_SMOKE_READY {"status":"ok","pid":4242,"productName":"AgentLog Pet","managerTitle":"AgentLog Pet","databaseName":"agentlog.db","managerShell":true}\n',
  ]);
  assert.doesNotMatch(writes[0], /private|user|data\//);
});

test("manager smoke stops the real packaged Electron process", () => {
  const smokeManager = fs.readFileSync(path.join(root, "scripts", "smoke-manager.cjs"), "utf8");

  assert.match(smokeManager, /\{ stopChild, stopPid \}/);
  assert.match(smokeManager, /ready\.pid/);
  assert.match(smokeManager, /await stopPid\(managerPid\)/);
});

function runPackagedSmokeFixture(secondExitCode) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-packaged-smoke-test-"));
  const fixture = path.join(temporary, "fake-packaged-app.cjs");
  const log = path.join(temporary, "launches.jsonl");
  const smokeLinux = path.join(root, "scripts", "smoke-linux.cjs");
  fs.writeFileSync(fixture, `#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const net = require("node:net");
const log = process.env.AGENTLOG_SMOKE_FIXTURE_LOG;
const socketPath = log + ".sock";
const args = process.argv.slice(2);
fs.appendFileSync(log, JSON.stringify({ pid: process.pid, args }) + "\\n");
if (args.includes("--ozone-platform=x11")) {
  const client = net.createConnection(socketPath);
  client.once("connect", () => {
    client.end();
    process.exit(Number(process.env.AGENTLOG_SMOKE_FIXTURE_SECOND_EXIT_CODE || 0));
  });
  client.once("error", () => process.exit(3));
} else {
  fs.rmSync(socketPath, { force: true });
  const server = net.createServer(() => {
    process.stdout.write("AGENTLOG_SMOKE_MANAGER_ACTIVATED\\n");
  });
  const stop = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 100).unref();
  };
  process.once("SIGTERM", stop);
  server.once("error", () => process.exit(2));
  server.listen(socketPath, () => {
    process.stdout.write("AGENTLOG_SMOKE_READY " + JSON.stringify({ productName: "AgentLog Pet", windowCount: 1, pid: process.pid }) + "\\n");
  });
}
`);
  fs.chmodSync(fixture, 0o755);
  const result = childProcess.spawnSync(process.execPath, [smokeLinux, fixture], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
    env: {
      ...process.env,
      AGENTLOG_SMOKE_FIXTURE_LOG: log,
      AGENTLOG_SMOKE_FIXTURE_SECOND_EXIT_CODE: String(secondExitCode),
    },
  });
  const launches = fs.existsSync(log)
    ? fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
    : [];
  return { launches, result, temporary };
}

function assertFixtureProcessesStopped(launches) {
  for (const { pid } of launches) {
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  }
}

test("packaged Linux smoke runs an explicit X11 second Electron process and stops both processes", () => {
  const run = runPackagedSmokeFixture(0);
  try {
    assert.equal(run.result.error, undefined, run.result.stderr);
    assert.equal(run.result.status, 0, run.result.stderr);
    assert.match(run.result.stdout, /"status":"ok"/);
    assert.deepEqual(run.launches.map(({ args }) => args), [[], ["--ozone-platform=x11"]]);
    assertFixtureProcessesStopped(run.launches);
  } finally {
    fs.rmSync(run.temporary, { recursive: true, force: true });
  }
});

test("packaged Linux smoke stops its first process when the explicit second process fails", () => {
  const run = runPackagedSmokeFixture(1);
  try {
    assert.equal(run.result.error, undefined, run.result.stderr);
    assert.equal(run.result.status, 1, run.result.stderr);
    assert.deepEqual(run.launches.map(({ args }) => args), [[], ["--ozone-platform=x11"]]);
    assertFixtureProcessesStopped(run.launches);
  } finally {
    fs.rmSync(run.temporary, { recursive: true, force: true });
  }
});

test("Linux smoke waits through the packaged X11 relaunch handoff", () => {
  const smokeLinux = fs.readFileSync(path.join(root, "scripts", "smoke-linux.cjs"), "utf8");

  assert.match(smokeLinux, /code === 0 && output\.includes\("relaunching under XWayland"\)/);
});

test("development launcher removes Electron's Node compatibility mode", () => {
  const launcher = fs.readFileSync(path.join(root, "scripts", "launch-electron.cjs"), "utf8");

  assert.match(launcher, /delete env\.ELECTRON_RUN_AS_NODE/);
  assert.match(launcher, /env,?\s*\n/);
});

test("postinstall verifies the root Electron installation", () => {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = childProcess.spawnSync(npmCommand, ["run", "postinstall"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Verified Electron \d+\.\d+\.\d+ installation\./);
  assert.doesNotMatch(result.stdout, /Skipped Electron install verification/);
});
