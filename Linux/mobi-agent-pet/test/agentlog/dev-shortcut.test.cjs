"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildDesktopEntry,
  installDesktopEntry,
  installThemeIcons,
} = require("../../scripts/install-dev-shortcut.cjs");

test("dev shortcut entry points at the repo launcher and brand icon", () => {
  const entry = buildDesktopEntry({ repoRoot: "/repo" });
  assert.match(entry, /^\[Desktop Entry\]\n/);
  assert.match(entry, /^Type=Application$/m);
  assert.match(entry, /^Terminal=false$/m);
  assert.match(entry, /^StartupWMClass=mobi-agent-pet-dev$/m);
  assert.match(entry, /^Name=Mobi Agent Pet \(Dev\)$/m);
  assert.match(entry, /^Name\[zh_CN\]=莫比 Pet（开发版）$/m);
  assert.match(entry, /^Exec="\/repo\/scripts\/launch-dev\.sh" --desktop$/m);
  assert.match(entry, /^Icon=mobi-agent-pet-dev$/m);
  assert.match(entry, /^Categories=Development;$/m);
});

test("install writes the entry into the applications directory", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-dev-shortcut-"));
  try {
    const { entryPath, desktopCopyPath } = installDesktopEntry({
      repoRoot: "/repo",
      homeDir,
      desktopDir: null,
    });
    assert.equal(desktopCopyPath, null);
    assert.ok(fs.existsSync(entryPath));
    assert.equal(fs.statSync(entryPath).mode & 0o777, 0o755);
    assert.equal(fs.readFileSync(entryPath, "utf8"), buildDesktopEntry({ repoRoot: "/repo" }));
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test("install removes only the previous shortcut for the same repo", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-shortcut-migrate-"));
  const repoRoot = "/repo";
  const applicationsDir = path.join(homeDir, ".local", "share", "applications");
  const oldEntry = path.join(applicationsDir, "agentlog-pet-dev.desktop");
  fs.mkdirSync(applicationsDir, { recursive: true });
  fs.writeFileSync(oldEntry, '[Desktop Entry]\nName=AgentLog Pet (Dev)\nExec="/repo/scripts/launch-dev.sh"\n');
  try {
    installDesktopEntry({ repoRoot, homeDir, desktopDir: null });
    assert.equal(fs.existsSync(oldEntry), false);
    fs.writeFileSync(oldEntry, '[Desktop Entry]\nName=Other App\nExec="/other/launch.sh"\n');
    installDesktopEntry({ repoRoot, homeDir, desktopDir: null });
    assert.equal(fs.existsSync(oldEntry), true);
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test("launcher script is committed executable", () => {
  const launcher = path.resolve(__dirname, "../../scripts/launch-dev.sh");
  assert.ok(fs.statSync(launcher).mode & 0o111, "launch-dev.sh must be executable");
});

test("installs brand icons into the user hicolor theme", () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-icon-repo-"));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-icon-home-"));
  try {
    const iconsDir = path.join(repoRoot, "assets", "brand", "icons");
    fs.mkdirSync(iconsDir, { recursive: true });
    fs.writeFileSync(path.join(iconsDir, "16x16.png"), "png-16");
    fs.writeFileSync(path.join(iconsDir, "256x256.png"), "png-256");

    const installed = installThemeIcons({ repoRoot, homeDir });

    assert.equal(installed, 2);
    const themed16 = path.join(
      homeDir,
      ".local", "share", "icons", "hicolor", "16x16", "apps", "mobi-agent-pet-dev.png"
    );
    const themed256 = path.join(
      homeDir,
      ".local", "share", "icons", "hicolor", "256x256", "apps", "mobi-agent-pet-dev.png"
    );
    assert.equal(fs.readFileSync(themed16, "utf8"), "png-16");
    assert.equal(fs.readFileSync(themed256, "utf8"), "png-256");
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});


for (const desktopLaunch of [false, true, 'closing-terminal']) {
test(`${desktopLaunch === true ? 'desktop owner stays alive' : desktopLaunch === 'closing-terminal' ? 'legacy terminal close cannot kill a worker before nohup initializes' : 'manual launcher detaches'}, logs and exits with its app`, { skip: process.platform !== 'linux' }, async () => {
  const { spawn, spawnSync } = require('node:child_process');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'mobi-dev-background-'));
  const scripts = path.join(fixture, 'scripts'), bin = path.join(fixture, 'bin');
  fs.mkdirSync(scripts); fs.mkdirSync(bin);
  const launcher = path.join(scripts, 'launch-dev.sh');
  fs.copyFileSync(path.resolve(__dirname, '../../scripts/launch-dev.sh'), launcher);
  const nohupPidFile = path.join(fixture, 'nohup.pid');
  if (desktopLaunch === 'closing-terminal') {
    fs.writeFileSync(path.join(bin, 'nohup'), '#!/usr/bin/env bash\necho $$ > "$MOBI_TEST_NOHUP_PID"\n/bin/sleep .3\nexec /usr/bin/nohup "$@"\n', { mode: 0o755 });
  }
  const pidFile = path.join(fixture, 'worker.pid'), stopFile = path.join(fixture, 'stop'), appPidFile = path.join(fixture, 'app.pid');
  const workerFile = path.join(fixture, 'worker.cjs'), appFile = path.join(fixture, 'app.cjs');
  fs.writeFileSync(appFile, `const fs=require('node:fs');fs.writeFileSync(process.env.MOBI_TEST_APP_PID,String(process.pid));console.log('fixture-ready',process.env.AGENTLOG_OPEN_MANAGER_ON_STARTUP);const timer=setInterval(()=>{if(fs.existsSync(process.env.MOBI_TEST_STOP))clearInterval(timer);},30);`);
  fs.writeFileSync(workerFile, `const {spawn}=require('node:child_process');const {launchElectron}=require(${JSON.stringify(path.resolve(__dirname, '../../scripts/launch-electron.cjs'))});launchElectron({root:${JSON.stringify(fixture)},electronPath:process.execPath,spawnFn:(file,args,opts)=>spawn(file,[${JSON.stringify(appFile)}],opts)});`);
  fs.writeFileSync(path.join(bin, 'npm'), `#!/usr/bin/env bash
echo $$ > "$MOBI_TEST_PID"
exec node "$MOBI_TEST_WORKER"
`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, XDG_STATE_HOME: path.join(fixture, 'state'), MOBI_TEST_NOHUP_PID: nohupPidFile, MOBI_TEST_PID: pidFile, MOBI_TEST_STOP: stopFile, MOBI_TEST_APP_PID: appPidFile, MOBI_TEST_WORKER: workerFile, AGENTLOG_OPEN_MANAGER_ON_STARTUP: '0' };
  const waitFor = async predicate => {
    const deadline = Date.now() + 3000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('timed out waiting for fixture process');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  const alive = pid => {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      return !/^Z /.test(stat.slice(stat.lastIndexOf(')') + 2));
    } catch { return false; }
  };
  let pid, owner;
  try {
    if (desktopLaunch === true) {
      owner = spawn('bash', [launcher, '--desktop'], { env, stdio: 'ignore' });
    } else {
      const result = spawnSync('bash', [launcher], { env, encoding: 'utf8', timeout: 1200 });
      assert.ifError(result.error);
      assert.equal(result.status, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
    }
    if (desktopLaunch === 'closing-terminal') {
      let nohupPid;
      await waitFor(() => {
        try {
          const candidate = Number(fs.readFileSync(nohupPidFile, 'utf8').trim());
          if (!Number.isSafeInteger(candidate) || candidate <= 1) return false;
          nohupPid = candidate;
          return true;
        } catch { return false; }
      });
      process.kill(nohupPid, 'SIGHUP');
    }
    await waitFor(() => { try { return Number(fs.readFileSync(pidFile, 'utf8')) > 1; } catch { return false; } }); pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    assert.ok(alive(pid));
    await waitFor(() => { try { return fs.readFileSync(path.join(fixture, 'state', 'mobi-agent-pet', 'dev.log'), 'utf8').includes('fixture-ready'); } catch { return false; } });
    const log = fs.readFileSync(path.join(fixture, 'state', 'mobi-agent-pet', 'dev.log'), 'utf8');
    assert.match(log, /fixture-ready 1/);
    assert.match(log, /stage=entry pid=\d+/);
    assert.match(log, /stage=runtime-resolved/);
    await waitFor(() => { try { return Number(fs.readFileSync(appPidFile, 'utf8')) > 1; } catch { return false; } });
    const appPid = Number(fs.readFileSync(appPidFile, 'utf8')); assert.ok(alive(appPid));
    if (desktopLaunch === true) {
      assert.equal(owner.exitCode, null, 'desktop launch owner must remain alive until application quits');
      assert.equal(owner.pid, pid, 'desktop entry must own the npm worker directly');
    }
    fs.writeFileSync(stopFile, 'quit'); await waitFor(() => !alive(pid) && !alive(appPid));
    if (desktopLaunch === true) {
      await waitFor(() => owner.exitCode !== null);
      assert.equal(owner.exitCode, 0);
    }
  } finally {
    if (!pid && fs.existsSync(pidFile)) pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    fs.writeFileSync(stopFile, 'quit');
    if (pid && alive(pid)) try { process.kill(pid, 'SIGTERM'); } catch {}
    if (owner && owner.exitCode === null) owner.kill('SIGTERM');
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

}


test('updating a shortcut leaves existing readers with a complete old entry', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobi-entry-publish-'));
  let reader;
  try {
    const { entryPath } = installDesktopEntry({ repoRoot: '/first-repo', homeDir, desktopDir: null });
    reader = fs.openSync(entryPath, 'r');
    installDesktopEntry({ repoRoot: '/second-repo', homeDir, desktopDir: null });
    const buffer = Buffer.alloc(4096);
    const bytes = fs.readSync(reader, buffer, 0, buffer.length, 0);
    assert.match(buffer.subarray(0, bytes).toString('utf8'), /Exec="\/first-repo\/scripts\/launch-dev.sh"/);
    assert.match(fs.readFileSync(entryPath, 'utf8'), /Exec="\/second-repo\/scripts\/launch-dev.sh"/);
  } finally {
    if (reader !== undefined) fs.closeSync(reader);
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});
