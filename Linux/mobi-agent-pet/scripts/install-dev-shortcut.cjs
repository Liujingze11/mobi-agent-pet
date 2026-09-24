"use strict";

// Installs a desktop shortcut that launches Mobi Agent Pet in development mode
// (`npm run dev`, via scripts/launch-dev.sh) with the brand logo as its icon.
// The entry is written to ~/.local/share/applications so it appears in the
// application menu (search for "Mobi Agent Pet"), and is copied to the desktop
// directory when one exists.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ENTRY_FILENAME = "mobi-agent-pet-dev.desktop";
const LEGACY_ENTRY_FILENAME = "agentlog-pet-dev.desktop";
const ENTRY_NAME = "Mobi Agent Pet (Dev)";
const ENTRY_COMMENT = "Run Mobi Agent Pet in development mode";
const ENTRY_ICON_NAME = "mobi-agent-pet-dev";
const ICON_SIZES = [16, 32, 48, 64, 128, 256, 512];

function buildDesktopEntry({ repoRoot }) {
  const launcherPath = path.join(repoRoot, "scripts", "launch-dev.sh");
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Version=1.0",
    `Name=${ENTRY_NAME}`,
    "Name[zh_CN]=莫比 Pet（开发版）",
    "Name[zh_TW]=莫比 Pet（開發版）",
    `Comment=${ENTRY_COMMENT}`,
    `Exec="${launcherPath}"`,
    // Icon theme name, not an absolute path: GNOME Shell resolves absolute
    // Icon= paths unreliably, so the brand icons are installed into the
    // user's hicolor theme below and referenced by name.
    `Icon=${ENTRY_ICON_NAME}`,
    "Terminal=true",
    "Categories=Development;",
    "Keywords=mobi;agent;pet;dev;",
    "StartupNotify=false",
    "",
  ].join("\n");
}

function refreshIconCache(themeDir) {
  try {
    execFileSync("gtk-update-icon-cache", ["-f", themeDir], { stdio: "ignore" });
  } catch {
    // Optional cache refresh; icon loaders still pick the files up.
  }
}

function installThemeIcons({ repoRoot, homeDir }) {
  const sourceDir = path.join(repoRoot, "assets", "brand", "icons");
  const themeDir = path.join(homeDir, ".local", "share", "icons", "hicolor");
  let installed = 0;
  for (const size of ICON_SIZES) {
    const source = path.join(sourceDir, `${size}x${size}.png`);
    if (!fs.existsSync(source)) continue;
    const targetDir = path.join(themeDir, `${size}x${size}`, "apps");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(source, path.join(targetDir, `${ENTRY_ICON_NAME}.png`));
    installed += 1;
  }
  if (installed > 0) refreshIconCache(themeDir);
  return installed;
}

function findDesktopDir(homeDir) {
  try {
    const dir = execFileSync("xdg-user-dir", ["DESKTOP"], { encoding: "utf8" }).trim();
    if (dir && dir !== homeDir && fs.existsSync(dir)) return dir;
  } catch {
    // xdg-user-dir is not always installed; fall back to ~/Desktop.
  }
  const fallback = path.join(homeDir, "Desktop");
  return fs.existsSync(fallback) ? fallback : null;
}

function refreshDesktopDatabase(applicationsDir) {
  try {
    execFileSync("update-desktop-database", [applicationsDir], { stdio: "ignore" });
  } catch {
    // Optional cache refresh; the application menu still picks the entry up.
  }
}

function trustEntry(entryPath) {
  try {
    execFileSync("gio", ["set", entryPath, "metadata::trusted", "true"], { stdio: "ignore" });
  } catch {
    // Trust metadata is only needed for desktop icons on some file managers.
  }
}

function removeOwnedLegacyEntry(directory, launcherPath) {
  if (!directory) return false;
  const legacyPath = path.join(directory, LEGACY_ENTRY_FILENAME);
  try {
    if (!fs.lstatSync(legacyPath).isFile()) return false;
    const lines = fs.readFileSync(legacyPath, "utf8").split(/\r?\n/);
    if (!lines.includes("Name=AgentLog Pet (Dev)") || !lines.includes(`Exec="${launcherPath}"`)) return false;
    fs.unlinkSync(legacyPath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

function installDesktopEntry({ repoRoot, homeDir, desktopDir = findDesktopDir(homeDir) }) {
  const applicationsDir = path.join(homeDir, ".local", "share", "applications");
  const entryPath = path.join(applicationsDir, ENTRY_FILENAME);
  const launcherPath = path.join(repoRoot, "scripts", "launch-dev.sh");
  fs.mkdirSync(applicationsDir, { recursive: true });
  removeOwnedLegacyEntry(applicationsDir, launcherPath);
  fs.writeFileSync(entryPath, buildDesktopEntry({ repoRoot }), { mode: 0o755 });

  let desktopCopyPath = null;
  if (desktopDir) {
    removeOwnedLegacyEntry(desktopDir, launcherPath);
    desktopCopyPath = path.join(desktopDir, ENTRY_FILENAME);
    fs.copyFileSync(entryPath, desktopCopyPath);
    fs.chmodSync(desktopCopyPath, 0o755);
    trustEntry(desktopCopyPath);
  }
  refreshDesktopDatabase(applicationsDir);
  const iconsInstalled = installThemeIcons({ repoRoot, homeDir });
  return { entryPath, desktopCopyPath, iconsInstalled };
}

if (require.main === module) {
  const repoRoot = path.resolve(__dirname, "..");
  const { entryPath, desktopCopyPath, iconsInstalled } = installDesktopEntry({
    repoRoot,
    homeDir: os.homedir(),
  });
  console.log(`Installed ${entryPath}`);
  console.log(`Installed ${iconsInstalled} brand icon(s) into ~/.local/share/icons/hicolor`);
  if (desktopCopyPath) {
    console.log(`Copied to desktop: ${desktopCopyPath}`);
  } else {
    console.log("No desktop directory found; the entry is available in the application menu only.");
  }
  console.log('Search "Mobi Agent Pet" in the application menu to launch it.');
}

module.exports = {
  ENTRY_FILENAME,
  buildDesktopEntry,
  findDesktopDir,
  installDesktopEntry,
  installThemeIcons,
};
