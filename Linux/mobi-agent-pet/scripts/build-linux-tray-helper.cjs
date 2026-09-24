"use strict";

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const nativeRoot = path.join(root, "native", "agentlog-tray");
const nativeExecutable = path.join(nativeRoot, "build", "agentlog-tray");
const stagingRoot = path.join(root, "build", "tray");
const stagedExecutable = path.join(stagingRoot, "bin", "agentlog-tray");
const stagedLibraryRoot = path.join(stagingRoot, "lib");
const iconSourceRoot = path.join(root, "assets", "tray-icons", "hicolor");
const stagedIconRoot = path.join(stagingRoot, "icons", "hicolor");
const noticeSource = path.join(root, "runtime", "clawd", "NOTICE.md");
const checksumFile = path.join(stagingRoot, "SHA256SUMS");
const PROTOCOL_MARKER = "agentlog-tray-protocol-v1";

const PKG_CONFIG_PACKAGES = [
  "gtk+-3.0",
  "ayatana-appindicator3-0.1",
  "json-glib-1.0",
];
const EXPECTED_DYNAMIC_SYMBOLS = [
  "app_indicator_new",
  "app_indicator_set_menu",
  "g_dbus_connection_call_sync",
  "gtk_init_check",
  "json_parser_new",
  "prctl",
];
const BUNDLED_SONAME_PREFIXES = [
  "libayatana-appindicator3.so",
  "libayatana-indicator3.so",
  "libdbusmenu-glib.so",
  "libdbusmenu-gtk3.so",
  "libjson-glib-1.0.so",
];
const ICON_NAMES = [
  "agentlog-pet.png",
  "agentlog-pet-panel.png",
  "agentlog-pet-attention.png",
  "agentlog-pet-attention-panel.png",
  "agentlog-pet-working.png",
  "agentlog-pet-working-panel.png",
  "agentlog-pet-question.png",
  "agentlog-pet-question-panel.png",
  "agentlog-pet-error.png",
  "agentlog-pet-error-panel.png",
];
const ICON_THEME_FILE = "index.theme";
const ICON_SIZES = [16, 22, 32, 48];

function run(command, args, options = {}) {
  const capture = options.capture === true;
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    shell: false,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) throw new Error(`unable to run ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = capture ? (result.stderr || result.stdout || "").trim() : "";
    throw new Error(
      `${command} exited with status ${result.status}${detail ? `: ${detail}` : ""}`,
    );
  }
  return capture ? result.stdout : "";
}

function verifyDependencies() {
  try {
    run(
      "pkg-config",
      ["--print-errors", "--exists", ...PKG_CONFIG_PACKAGES],
      { capture: true },
    );
  } catch (error) {
    throw new Error(
      `missing native tray build dependencies (${PKG_CONFIG_PACKAGES.join(", ")}): ${error.message}`,
    );
  }
}

function dynamicValues(file, tag) {
  const output = run("readelf", ["--wide", "--dynamic", file], { capture: true });
  const expression = new RegExp(`\\(${tag}\\).*\\[([^\\]]+)\\]`);
  return output
    .split(/\r?\n/)
    .map((line) => line.match(expression)?.[1])
    .filter(Boolean);
}

function addProtocolMarker() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-tray-marker-"));
  const markerFile = path.join(temporary, "protocol-v1");
  try {
    fs.writeFileSync(markerFile, `${PROTOCOL_MARKER}\0`, "ascii");
    run("objcopy", [
      "--add-section", `.agentlog.protocol=${markerFile}`,
      "--set-section-flags", ".agentlog.protocol=contents,readonly",
      nativeExecutable,
    ]);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function verifyExecutable() {
  const description = run("file", ["--brief", nativeExecutable], {
    capture: true,
  }).trim();
  if (!/\bELF 64-bit LSB (?:pie )?executable, x86-64\b/.test(description)) {
    throw new Error(`unexpected native tray executable format: ${description}`);
  }

  const symbolOutput = run(
    "nm",
    ["-D", "--undefined-only", nativeExecutable],
    { capture: true },
  );
  const symbols = new Set(
    symbolOutput
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/).at(-1)?.split("@")[0])
      .filter(Boolean),
  );
  const missingSymbols = EXPECTED_DYNAMIC_SYMBOLS.filter((symbol) => !symbols.has(symbol));
  if (missingSymbols.length > 0) {
    throw new Error(`native tray executable is missing symbols: ${missingSymbols.join(", ")}`);
  }

  const runpaths = dynamicValues(nativeExecutable, "RUNPATH");
  if (runpaths.length !== 1 || runpaths[0] !== "$ORIGIN/../lib") {
    throw new Error(`native tray executable has unexpected RUNPATH: ${runpaths.join(", ") || "none"}`);
  }
  if (dynamicValues(nativeExecutable, "RPATH").length > 0) {
    throw new Error("native tray executable must not contain RPATH");
  }
  const marker = run(
    "readelf",
    ["--string-dump=.agentlog.protocol", nativeExecutable],
    { capture: true },
  );
  if (!marker.includes(PROTOCOL_MARKER)) {
    throw new Error("native tray executable is missing the protocol-v1 marker");
  }
}

function resolvedBundledLibraries() {
  const output = run("ldd", [nativeExecutable], { capture: true });
  const resolved = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\S+)\s+=>\s+(\S+)\s+\(/);
    if (match && BUNDLED_SONAME_PREFIXES.some((prefix) => match[1].startsWith(prefix))) {
      resolved.set(match[1], match[2]);
    }
  }

  const missing = BUNDLED_SONAME_PREFIXES.filter(
    (prefix) => ![...resolved].some(([soname]) => soname.startsWith(prefix)),
  );
  if (missing.length > 0) {
    throw new Error(`ldd did not resolve required bundled libraries: ${missing.join(", ")}`);
  }
  return [...resolved].sort(([left], [right]) => left.localeCompare(right));
}

function stageLibraries() {
  fs.mkdirSync(stagedLibraryRoot, { recursive: true });
  for (const [resolvedSoname, resolvedPath] of resolvedBundledLibraries()) {
    if (!path.isAbsolute(resolvedPath) || !fs.existsSync(resolvedPath)) {
      throw new Error(`ldd returned an invalid path for ${resolvedSoname}: ${resolvedPath}`);
    }
    const realSource = fs.realpathSync(resolvedPath);
    const sonames = dynamicValues(realSource, "SONAME");
    if (sonames.length !== 1 || sonames[0] !== resolvedSoname) {
      throw new Error(`unexpected SONAME for ${realSource}: ${sonames.join(", ") || "none"}`);
    }

    const realName = path.basename(realSource);
    const stagedReal = path.join(stagedLibraryRoot, realName);
    fs.copyFileSync(realSource, stagedReal);
    fs.chmodSync(stagedReal, 0o644);
    if (realName !== resolvedSoname) {
      fs.symlinkSync(realName, path.join(stagedLibraryRoot, resolvedSoname));
    }
  }
}

function stageIcons() {
  const themeSource = path.join(iconSourceRoot, ICON_THEME_FILE);
  const themeDestination = path.join(stagedIconRoot, ICON_THEME_FILE);
  if (!fs.existsSync(themeSource)) throw new Error(`missing tray icon theme: ${themeSource}`);
  fs.mkdirSync(stagedIconRoot, { recursive: true });
  fs.copyFileSync(themeSource, themeDestination);
  fs.chmodSync(themeDestination, 0o644);

  for (const size of ICON_SIZES) {
    for (const name of ICON_NAMES) {
      const relative = path.join(`${size}x${size}`, "status", name);
      const source = path.join(iconSourceRoot, relative);
      const destination = path.join(stagedIconRoot, relative);
      if (!fs.existsSync(source)) throw new Error(`missing stable tray icon: ${source}`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
      fs.chmodSync(destination, 0o644);
    }
  }
}

function regularFileInventory(directory) {
  const files = [];
  function visit(relative) {
    const absolute = path.join(directory, relative);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (child === "SHA256SUMS") continue;
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) files.push(child.split(path.sep).join("/"));
    }
  }
  visit("");
  return files.sort();
}

function writeChecksums() {
  const lines = regularFileInventory(stagingRoot).map((relative) => {
    const digest = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(stagingRoot, relative)))
      .digest("hex");
    return `${digest}  ${relative}`;
  });
  fs.writeFileSync(checksumFile, `${lines.join("\n")}\n`, { mode: 0o644 });
}

function stageBundle() {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(stagedExecutable), { recursive: true });
  fs.copyFileSync(nativeExecutable, stagedExecutable);
  fs.chmodSync(stagedExecutable, 0o755);
  stageLibraries();
  stageIcons();
  fs.copyFileSync(noticeSource, path.join(stagingRoot, "NOTICE"));
  fs.chmodSync(path.join(stagingRoot, "NOTICE"), 0o644);
  for (const directory of [
    stagingRoot,
    path.join(stagingRoot, "bin"),
    stagedLibraryRoot,
    path.join(stagingRoot, "icons"),
    stagedIconRoot,
    ...ICON_SIZES.flatMap((size) => [
      path.join(stagedIconRoot, `${size}x${size}`),
      path.join(stagedIconRoot, `${size}x${size}`, "status"),
    ]),
  ]) {
    fs.chmodSync(directory, 0o755);
  }
  writeChecksums();
  return crypto.createHash("sha256").update(fs.readFileSync(stagedExecutable)).digest("hex");
}

function main() {
  const unsupported = process.argv.slice(2).filter((arg) => arg !== "--development");
  if (unsupported.length > 0) throw new Error(`unsupported argument: ${unsupported[0]}`);

  verifyDependencies();
  run("make", ["clean", "all", "test"], { cwd: nativeRoot });
  addProtocolMarker();
  verifyExecutable();
  const digest = stageBundle();
  process.stdout.write(`Built build/tray/bin/agentlog-tray (${digest})\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`build-linux-tray-helper: ${error.message}\n`);
  process.exitCode = 1;
}
