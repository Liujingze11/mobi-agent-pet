"use strict";

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const nativeRoot = path.join(root, "native", "agentlog-tray");
const nativeExecutable = path.join(nativeRoot, "build", "agentlog-tray");
const stagingRoot = path.join(root, "build", "tray");
const stagedExecutable = path.join(stagingRoot, "bin", "agentlog-tray");
const checksumFile = path.join(stagingRoot, "SHA256SUMS");

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

function run(command, args, options = {}) {
  const capture = options.capture === true;
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    shell: false,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) {
    throw new Error(`unable to run ${command}: ${result.error.message}`);
  }
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
  const missingSymbols = EXPECTED_DYNAMIC_SYMBOLS.filter(
    (symbol) => !symbols.has(symbol),
  );
  if (missingSymbols.length > 0) {
    throw new Error(`native tray executable is missing symbols: ${missingSymbols.join(", ")}`);
  }
}

function stageExecutable() {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(stagedExecutable), { recursive: true });
  fs.copyFileSync(nativeExecutable, stagedExecutable);
  fs.chmodSync(stagedExecutable, fs.statSync(nativeExecutable).mode & 0o777);

  const digest = crypto
    .createHash("sha256")
    .update(fs.readFileSync(stagedExecutable))
    .digest("hex");
  fs.writeFileSync(checksumFile, `${digest}  bin/agentlog-tray\n`, "utf8");
  return digest;
}

function main() {
  const unsupported = process.argv.slice(2).filter((arg) => arg !== "--development");
  if (unsupported.length > 0) {
    throw new Error(`unsupported argument: ${unsupported[0]}`);
  }

  verifyDependencies();
  run("make", ["clean", "all", "test"], { cwd: nativeRoot });
  verifyExecutable();
  const digest = stageExecutable();
  process.stdout.write(`Built build/tray/bin/agentlog-tray (${digest})\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`build-linux-tray-helper: ${error.message}\n`);
  process.exitCode = 1;
}
