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
  assert.match(entry, /^Terminal=true$/m);
  assert.match(entry, /^Name=Mobi Agent Pet \(Dev\)$/m);
  assert.match(entry, /^Name\[zh_CN\]=莫比 Pet（开发版）$/m);
  assert.match(entry, /^Exec="\/repo\/scripts\/launch-dev\.sh"$/m);
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
