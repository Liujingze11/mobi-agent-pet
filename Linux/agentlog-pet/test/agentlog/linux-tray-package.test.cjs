"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { test } = require("node:test");
const { validateConfiguration } = require("app-builder-lib/out/util/config/config.js");

const ROOT = path.resolve(__dirname, "..", "..");
const PACKAGE_JSON = path.join(ROOT, "package.json");
const STAGING_ROOT = path.join(ROOT, "build", "tray");
const HELPER = path.join(STAGING_ROOT, "bin", "agentlog-tray");
const LIB_ROOT = path.join(STAGING_ROOT, "lib");
const STAGING_AVAILABLE = fs.existsSync(STAGING_ROOT);
const VERIFIER = path.join(ROOT, "scripts", "verify-linux-tray-bundle.cjs");
const ICON_NAMES = ["agentlog-pet.png", "agentlog-pet-attention.png"];
const ICON_SIZES = [16, 22, 32, 48];
const BUNDLED_SONAME_PREFIXES = [
  "libayatana-appindicator3.so",
  "libayatana-indicator3.so",
  "libdbusmenu-glib.so",
  "libdbusmenu-gtk3.so",
  "libjson-glib-1.0.so",
];
const BASELINE_DEBIAN_DEPENDENCIES = [
  "libgtk-3-0 | libgtk-3-0t64",
  "libnotify4",
  "libnss3",
  "libxss1",
  "libxtst6",
  "xdg-utils",
  "libatspi2.0-0",
  "libuuid1",
  "libsecret-1-0",
  "libayatana-appindicator3-1",
  "libjson-glib-1.0-0",
];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    encoding: "utf8",
    env: options.env || process.env,
    shell: false,
  });
}

function runChecked(command, args, options = {}) {
  const result = run(command, args, options);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`,
  );
  return result.stdout;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function inspectPng(file) {
  const png = fs.readFileSync(file);
  assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE, `${file} must have a PNG signature`);

  let offset = 8;
  let header;
  const compressed = [];
  let sawEnd = false;
  while (offset < png.length) {
    assert.ok(offset + 12 <= png.length, `${file} has a truncated PNG chunk`);
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assert.ok(dataEnd + 4 <= png.length, `${file} has a truncated ${type} chunk`);
    const typeAndData = png.subarray(offset + 4, dataEnd);
    assert.equal(png.readUInt32BE(dataEnd), crc32(typeAndData), `${file} has a bad ${type} CRC`);

    if (type === "IHDR") {
      assert.equal(length, 13, `${file} must have a 13-byte IHDR`);
      assert.equal(header, undefined, `${file} must contain one IHDR`);
      header = {
        width: png.readUInt32BE(dataStart),
        height: png.readUInt32BE(dataStart + 4),
        bitDepth: png[dataStart + 8],
        colorType: png[dataStart + 9],
        compression: png[dataStart + 10],
        filter: png[dataStart + 11],
        interlace: png[dataStart + 12],
      };
    } else if (type === "IDAT") {
      compressed.push(png.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      assert.equal(length, 0, `${file} must have an empty IEND`);
      sawEnd = true;
      offset = dataEnd + 4;
      break;
    }
    offset = dataEnd + 4;
  }

  assert.ok(header, `${file} must contain IHDR`);
  assert.ok(sawEnd, `${file} must contain IEND`);
  assert.equal(offset, png.length, `${file} must not have bytes after IEND`);
  assert.equal(header.bitDepth, 8, `${file} must use 8-bit channels`);
  assert.ok([2, 6].includes(header.colorType), `${file} must be RGB or RGBA`);
  assert.equal(header.compression, 0, `${file} must use PNG compression method 0`);
  assert.equal(header.filter, 0, `${file} must use PNG filter method 0`);
  assert.equal(header.interlace, 0, `${file} must be non-interlaced`);
  const channels = header.colorType === 2 ? 3 : 4;
  const pixels = zlib.inflateSync(Buffer.concat(compressed));
  assert.equal(
    pixels.length,
    header.height * (1 + header.width * channels),
    `${file} scanline data must match its dimensions`,
  );
  assert.ok(pixels.some((byte, index) => index % (1 + header.width * channels) !== 0 && byte !== 0), `${file} must contain image data`);
  return header;
}

function parseDynamicEntries(file) {
  const output = runChecked("readelf", ["--wide", "--dynamic", file]);
  const entries = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/\(([^)]+)\)\s+.*?(?:\[([^\]]*)\])?\s*$/);
    if (match) entries.push({ tag: match[1], value: match[2] });
  }
  return entries;
}

function checksumInventory(root) {
  const inventory = [];
  function visit(relative) {
    const absolute = path.join(root, relative);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (child === "SHA256SUMS") continue;
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) inventory.push(child.split(path.sep).join("/"));
    }
  }
  visit("");
  return inventory.sort();
}

function copyStaging(prefix) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const copied = path.join(temporary, "tray");
  fs.cpSync(STAGING_ROOT, copied, {
    recursive: true,
    preserveTimestamps: true,
    verbatimSymlinks: true,
  });
  return { temporary, copied };
}

function removeChecksumEntries(root, entries) {
  const checksum = path.join(root, "SHA256SUMS");
  const retained = fs.readFileSync(checksum, "utf8")
    .trimEnd()
    .split("\n")
    .filter((line) => !entries.some((entry) => line.endsWith(`  ${entry}`)));
  fs.writeFileSync(checksum, `${retained.join("\n")}\n`);
}

function writeChecksums(root) {
  const lines = checksumInventory(root).map((relative) => {
    const digest = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(root, relative)))
      .digest("hex");
    return `${digest}  ${relative}`;
  });
  fs.writeFileSync(path.join(root, "SHA256SUMS"), `${lines.join("\n")}\n`);
}

function parseTopLevelTapOutcomes(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^ok \d+ - (.+?)( # SKIP(?: .*)?)?$/);
    return match ? [{ name: match[1], skipped: Boolean(match[2]) }] : [];
  });
}

test("electron-builder has the complete Linux tray package configuration", async () => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8"));
  await validateConfiguration(pkg.build, { isEnabled: false, add() {} });
  assert.equal(
    pkg.scripts["prebuild:linux"],
    "npm run build:manager && node runtime/clawd/scripts/verify-sidecar-binaries.js build:linux && node scripts/build-linux-tray-helper.cjs && node scripts/verify-linux-tray-bundle.cjs build/tray",
  );
  assert.deepEqual(pkg.build.linux.target, [
    { target: "AppImage", arch: ["x64"] },
    { target: "deb", arch: ["x64"] },
  ]);
  assert.deepEqual(pkg.build.linux.extraResources, [
    {
      from: "runtime/clawd/bin/cc-connect-clawd/linux-${arch}",
      to: "sidecars/cc-connect-clawd/linux-${arch}",
    },
    { from: "build/tray", to: "tray" },
  ]);
  assert.equal(pkg.build.linux.depends, undefined);
  assert.deepEqual(pkg.build.deb.depends, BASELINE_DEBIAN_DEPENDENCIES);
});

test("the repository contains eight structurally valid stable tray icons", () => {
  for (const size of ICON_SIZES) {
    for (const name of ICON_NAMES) {
      const file = path.join(ROOT, "assets", "tray-icons", "hicolor", `${size}x${size}`, "status", name);
      const header = inspectPng(file);
      assert.deepEqual([header.width, header.height], [size, size], file);
    }
  }
});

test("the staged bundle passes the production verifier", { skip: !STAGING_AVAILABLE }, () => {
  const result = run(process.execPath, [VERIFIER, STAGING_ROOT]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Verified Linux tray bundle/);
});

test("the staged helper is executable x86-64 ELF with protocol v1 and a relative RUNPATH", { skip: !STAGING_AVAILABLE }, () => {
  const mode = fs.statSync(HELPER).mode & 0o777;
  assert.equal(mode, 0o755, "staging must normalize the helper mode to 0755");
  const elf = fs.readFileSync(HELPER);
  assert.deepEqual(
    elf.subarray(0, 6),
    Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]),
    "helper must be ELF64 little-endian",
  );
  assert.equal(elf.readUInt16LE(18), 62, "helper must target the x86-64 machine type");
  const marker = runChecked("readelf", ["--string-dump=.agentlog.protocol", HELPER]);
  assert.match(marker, /\bagentlog-tray-protocol-v1\b/);

  const dynamic = parseDynamicEntries(HELPER);
  assert.deepEqual(
    dynamic.filter((entry) => entry.tag === "RUNPATH").map((entry) => entry.value),
    ["$ORIGIN/../lib"],
  );
  assert.equal(dynamic.some((entry) => entry.tag === "RPATH"), false);
});

test("the staged library closure is complete, bounded, and resolves from staging", { skip: !STAGING_AVAILABLE }, () => {
  const entries = fs.readdirSync(LIB_ROOT, { withFileTypes: true });
  assert.ok(entries.length > 0, "build/tray/lib must not be empty");
  for (const entry of entries) {
    assert.ok(entry.isFile() || entry.isSymbolicLink(), `${entry.name} must be a file or symlink`);
    assert.ok(
      BUNDLED_SONAME_PREFIXES.some((prefix) => entry.name.startsWith(prefix)),
      `${entry.name} is outside the permitted SONAME families`,
    );
    const resolved = fs.realpathSync(path.join(LIB_ROOT, entry.name));
    assert.ok(resolved.startsWith(`${fs.realpathSync(LIB_ROOT)}${path.sep}`));
  }

  for (const prefix of BUNDLED_SONAME_PREFIXES) {
    assert.ok(entries.some((entry) => entry.name.startsWith(prefix)), `${prefix} must be staged`);
  }

  for (const entry of entries.filter((candidate) => candidate.isFile())) {
    const file = path.join(LIB_ROOT, entry.name);
    const sonames = parseDynamicEntries(file)
      .filter((dynamic) => dynamic.tag === "SONAME")
      .map((dynamic) => dynamic.value);
    assert.equal(sonames.length, 1, `${entry.name} must declare exactly one SONAME`);
    assert.ok(fs.existsSync(path.join(LIB_ROOT, sonames[0])), `${sonames[0]} must be staged`);
  }

  const output = runChecked("ldd", [HELPER], {
    env: { ...process.env, LD_LIBRARY_PATH: LIB_ROOT },
  });
  const resolutions = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\S+)\s+=>\s+(\S+)/);
    if (match) resolutions.set(match[1], match[2]);
  }
  for (const prefix of BUNDLED_SONAME_PREFIXES) {
    const match = [...resolutions].find(([soname]) => soname.startsWith(prefix));
    assert.ok(match, `${prefix} must appear in ldd resolution`);
    assert.ok(
      fs.realpathSync(match[1]).startsWith(`${fs.realpathSync(LIB_ROOT)}${path.sep}`),
      `${match[0]} must resolve from build/tray/lib, got ${match[1]}`,
    );
  }
  assert.doesNotMatch(output, /not found/);
});

test("SHA256SUMS covers every required staged regular file and verifies", { skip: !STAGING_AVAILABLE }, () => {
  const checksumFile = path.join(STAGING_ROOT, "SHA256SUMS");
  const listed = fs.readFileSync(checksumFile, "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => {
      const match = line.match(/^([0-9a-f]{64})  ([^/].*)$/);
      assert.ok(match, `invalid SHA256SUMS line: ${line}`);
      assert.equal(path.isAbsolute(match[2]), false);
      assert.equal(match[2].split("/").includes(".."), false);
      return match[2];
    })
    .sort();
  assert.deepEqual(listed, checksumInventory(STAGING_ROOT));
  runChecked("sha256sum", ["--check", "SHA256SUMS"], { cwd: STAGING_ROOT });
});

test("the verifier rejects incomplete, extra, duplicate, and stale checksums", { skip: !STAGING_AVAILABLE }, () => {
  const cases = [
    {
      name: "missing entry",
      mutate(root) {
        removeChecksumEntries(root, ["NOTICE"]);
      },
      message: /SHA256SUMS must cover every staged regular file/,
    },
    {
      name: "extra entry",
      mutate(root) {
        fs.appendFileSync(path.join(root, "SHA256SUMS"), `${"0".repeat(64)}  unlisted-payload\n`);
      },
      message: /SHA256SUMS must cover every staged regular file/,
    },
    {
      name: "duplicate entry",
      mutate(root) {
        const checksum = path.join(root, "SHA256SUMS");
        const first = fs.readFileSync(checksum, "utf8").split("\n")[0];
        fs.appendFileSync(checksum, `${first}\n`);
      },
      message: /duplicate checksum entry/,
    },
    {
      name: "stale digest",
      mutate(root) {
        fs.appendFileSync(path.join(root, "NOTICE"), "\nchecksum mutation\n");
      },
      message: /checksum mismatch/,
    },
  ];

  for (const mutation of cases) {
    const { temporary, copied } = copyStaging("agentlog-tray-checksum-test-");
    try {
      mutation.mutate(copied);
      const result = run(process.execPath, [VERIFIER, copied]);
      assert.notEqual(result.status, 0, `${mutation.name} must be rejected`);
      assert.match(result.stderr, mutation.message);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
});

test("the verifier scans every checksummed payload for environment-specific paths", { skip: !STAGING_AVAILABLE }, () => {
  const { temporary, copied } = copyStaging("agentlog-tray-path-scan-test-");
  try {
    fs.appendFileSync(path.join(copied, "NOTICE"), `\n${process.env.HOME}/tray-path-mutation\n`);
    writeChecksums(copied);
    const result = run(process.execPath, [VERIFIER, copied]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /absolute home path/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("the verifier rejects a staged helper without executable permission", { skip: !STAGING_AVAILABLE }, () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-tray-mode-test-"));
  const copied = path.join(temporary, "tray");
  try {
    fs.cpSync(STAGING_ROOT, copied, { recursive: true, preserveTimestamps: true });
    fs.chmodSync(path.join(copied, "bin", "agentlog-tray"), 0o644);
    const result = run(process.execPath, [VERIFIER, copied]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /mode 0755/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("the verifier requires helper mode exactly 0755", { skip: !STAGING_AVAILABLE }, () => {
  for (const mode of [0o700, 0o001, 0o4755]) {
    const { temporary, copied } = copyStaging("agentlog-tray-mode-variant-test-");
    try {
      fs.chmodSync(path.join(copied, "bin", "agentlog-tray"), mode);
      const result = run(process.execPath, [VERIFIER, copied]);
      assert.notEqual(result.status, 0, `mode ${mode.toString(8)} must be rejected`);
      assert.match(result.stderr, /mode 0755/);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
});

test("the verifier rejects an absolute staged library symlink", { skip: !STAGING_AVAILABLE }, () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-tray-link-test-"));
  const copied = path.join(temporary, "tray");
  try {
    fs.cpSync(STAGING_ROOT, copied, {
      recursive: true,
      preserveTimestamps: true,
      verbatimSymlinks: true,
    });
    const link = path.join(copied, "lib", "libayatana-appindicator3.so.1");
    const target = path.join(copied, "lib", path.basename(fs.realpathSync(link)));
    fs.unlinkSync(link);
    fs.symlinkSync(target, link);
    const result = run(process.execPath, [VERIFIER, copied]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /relative symlink/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("the verifier rejects a relative SONAME link that escapes lib", { skip: !STAGING_AVAILABLE }, () => {
  const { temporary, copied } = copyStaging("agentlog-tray-relative-link-test-");
  try {
    const link = path.join(copied, "lib", "libayatana-appindicator3.so.1");
    const real = path.basename(fs.realpathSync(link));
    fs.unlinkSync(link);
    fs.symlinkSync(path.join("..", "lib", real), link);
    const result = run(process.execPath, [VERIFIER, copied]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must target/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("the verifier rejects top-level and payload symlink escapes", { skip: !STAGING_AVAILABLE }, () => {
  const icon = path.join("icons", "hicolor", "16x16", "status", "agentlog-pet.png");
  const cases = [
    {
      name: "bin directory",
      relative: "bin",
      source: path.join(STAGING_ROOT, "bin"),
      checksumEntries: ["bin/agentlog-tray"],
      type: "dir",
    },
    {
      name: "helper payload",
      relative: path.join("bin", "agentlog-tray"),
      source: HELPER,
      checksumEntries: ["bin/agentlog-tray"],
      type: "file",
    },
    {
      name: "icon payload",
      relative: icon,
      source: path.join(STAGING_ROOT, icon),
      checksumEntries: [icon],
      type: "file",
    },
  ];

  for (const mutation of cases) {
    const { temporary, copied } = copyStaging("agentlog-tray-boundary-link-test-");
    try {
      const destination = path.join(copied, mutation.relative);
      fs.rmSync(destination, { recursive: mutation.type === "dir", force: true });
      fs.symlinkSync(mutation.source, destination, mutation.type);
      removeChecksumEntries(copied, mutation.checksumEntries);
      const result = run(process.execPath, [VERIFIER, copied]);
      assert.notEqual(result.status, 0, `${mutation.name} symlink must be rejected`);
      assert.match(result.stderr, /real (directory|regular file)|symlink/);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
});

test("the verifier rejects an extra real library in an allowed family", { skip: !STAGING_AVAILABLE }, () => {
  const { temporary, copied } = copyStaging("agentlog-tray-extra-library-test-");
  try {
    const libraryRoot = path.join(copied, "lib");
    fs.copyFileSync(
      path.join(libraryRoot, "libjson-glib-1.0.so.0.600.6"),
      path.join(libraryRoot, "libjson-glib-1.0.so.0.600.6.extra"),
    );
    writeChecksums(copied);
    const result = run(process.execPath, [VERIFIER, copied]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exactly five real files|exactly one real library/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("the verifier rejects a SONAME link mapped to the wrong real library", { skip: !STAGING_AVAILABLE }, () => {
  const { temporary, copied } = copyStaging("agentlog-tray-soname-link-test-");
  try {
    const link = path.join(copied, "lib", "libayatana-appindicator3.so.1");
    fs.unlinkSync(link);
    fs.symlinkSync("libjson-glib-1.0.so.0.600.6", link);
    const result = run(process.execPath, [VERIFIER, copied]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must target/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test(
  "the package test suite succeeds without ignored tray staging",
  { skip: !STAGING_AVAILABLE || process.env.AGENTLOG_TRAY_TEST_STAGING_ABSENT === "1" },
  () => {
    const withheld = path.join(ROOT, "build", `.tray-clean-checkout-${process.pid}`);
    assert.ok(fs.existsSync(STAGING_ROOT), "this regression requires an existing staging bundle");
    try {
      fs.renameSync(STAGING_ROOT, withheld);
      const environment = { ...process.env, AGENTLOG_TRAY_TEST_STAGING_ABSENT: "1" };
      delete environment.NODE_TEST_CONTEXT;
      const result = run(process.execPath, ["--test", "--test-reporter=tap", __filename], {
        env: environment,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const outcomes = parseTopLevelTapOutcomes(result.stdout);
      assert.deepEqual(
        outcomes.filter(({ skipped }) => !skipped).map(({ name }) => name),
        [
          "electron-builder has the complete Linux tray package configuration",
          "the repository contains eight structurally valid stable tray icons",
        ],
      );
      assert.equal(outcomes.length, 16, "the child must report every package test");
      assert.equal(
        outcomes.filter(({ skipped }) => skipped).length,
        14,
        "only staging-dependent tests and this regression may skip",
      );
    } finally {
      fs.renameSync(withheld, STAGING_ROOT);
    }
  },
);
