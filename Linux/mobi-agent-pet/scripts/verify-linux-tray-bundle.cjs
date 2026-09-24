"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const projectRoot = path.resolve(__dirname, "..");
const PROTOCOL_MARKER = "agentlog-tray-protocol-v1";
const BUNDLED_LIBRARIES = [
  { family: "libayatana-appindicator3.so", soname: "libayatana-appindicator3.so.1" },
  { family: "libayatana-indicator3.so", soname: "libayatana-indicator3.so.7" },
  { family: "libdbusmenu-glib.so", soname: "libdbusmenu-glib.so.4" },
  { family: "libdbusmenu-gtk3.so", soname: "libdbusmenu-gtk3.so.4" },
  { family: "libjson-glib-1.0.so", soname: "libjson-glib-1.0.so.0" },
];
const BUNDLED_SONAME_PREFIXES = BUNDLED_LIBRARIES.map(({ family }) => family);
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
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    encoding: "utf8",
    env: options.env || process.env,
    shell: false,
  });
  if (result.error) throw new Error(`unable to run ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `${command} exited with status ${result.status}: ${(result.stderr || result.stdout || "").trim()}`,
    );
  }
  return result.stdout;
}

function dynamicValues(file, tag) {
  const output = run("readelf", ["--wide", "--dynamic", file]);
  const expression = new RegExp(`\\(${tag}\\).*\\[([^\\]]+)\\]`);
  return output
    .split(/\r?\n/)
    .map((line) => line.match(expression)?.[1])
    .filter(Boolean);
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

function inspectPng(file, expectedSize) {
  const png = fs.readFileSync(file);
  assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE, `${file} has an invalid PNG signature`);
  let offset = 8;
  let header;
  const compressed = [];
  let ended = false;
  while (offset < png.length) {
    assert.ok(offset + 12 <= png.length, `${file} has a truncated PNG chunk`);
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assert.ok(dataEnd + 4 <= png.length, `${file} has a truncated ${type} chunk`);
    assert.equal(
      png.readUInt32BE(dataEnd),
      crc32(png.subarray(offset + 4, dataEnd)),
      `${file} has a bad ${type} CRC`,
    );
    if (type === "IHDR") {
      assert.equal(length, 13, `${file} has an invalid IHDR`);
      assert.equal(header, undefined, `${file} has duplicate IHDR chunks`);
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
      assert.equal(length, 0, `${file} has an invalid IEND`);
      ended = true;
      offset = dataEnd + 4;
      break;
    }
    offset = dataEnd + 4;
  }

  assert.ok(header && ended, `${file} is missing required PNG chunks`);
  assert.equal(offset, png.length, `${file} has data after IEND`);
  assert.deepEqual([header.width, header.height], [expectedSize, expectedSize], `${file} dimensions`);
  assert.equal(header.bitDepth, 8, `${file} must use 8-bit channels`);
  assert.ok([2, 6].includes(header.colorType), `${file} must be RGB or RGBA`);
  assert.deepEqual(
    [header.compression, header.filter, header.interlace],
    [0, 0, 0],
    `${file} must be a non-interlaced standard PNG`,
  );
  const channels = header.colorType === 2 ? 3 : 4;
  const pixels = zlib.inflateSync(Buffer.concat(compressed));
  assert.equal(pixels.length, expectedSize * (1 + expectedSize * channels), `${file} pixel data`);
}

function assertRealDirectory(file, label) {
  assert.ok(fs.lstatSync(file).isDirectory(), `${label} must be a real directory`);
}

function assertRealFile(file, label) {
  assert.ok(fs.lstatSync(file).isFile(), `${label} must be a real regular file`);
}

function assertNoSymlinks(directory, relative = "") {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    const absolute = path.join(directory, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `${child} must not be a symlink`);
    if (entry.isDirectory()) assertNoSymlinks(absolute, child);
  }
}

function regularFileInventory(root) {
  const files = [];
  function visit(relative) {
    const absolute = path.join(root, relative);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (child === "SHA256SUMS") continue;
      if (entry.isDirectory()) visit(child);
      else if (entry.isSymbolicLink()) {
        assert.ok(
          relative === "lib" && BUNDLED_LIBRARIES.some(({ soname }) => entry.name === soname),
          `${child} must not be a symlink`,
        );
      }
      else if (entry.isFile()) files.push(child.split(path.sep).join("/"));
      else assert.fail(`${child} has an unsupported payload type`);
    }
  }
  visit("");
  return files.sort();
}

function verifyTopLevel(stagingRoot) {
  assertRealDirectory(stagingRoot, "staging root");
  const actual = fs.readdirSync(stagingRoot).sort();
  assert.deepEqual(actual, ["NOTICE", "SHA256SUMS", "bin", "icons", "lib"]);
  for (const directory of ["bin", "lib", "icons", path.join("icons", "hicolor")]) {
    assertRealDirectory(path.join(stagingRoot, directory), directory);
  }
  assertRealFile(path.join(stagingRoot, "NOTICE"), "NOTICE");
  assertRealFile(path.join(stagingRoot, "SHA256SUMS"), "SHA256SUMS");
}

function verifyHelper(stagingRoot) {
  const helper = path.join(stagingRoot, "bin", "agentlog-tray");
  const stat = fs.lstatSync(helper);
  assertRealFile(helper, "bin/agentlog-tray");
  assert.equal(stat.mode & 0o7777, 0o755, "bin/agentlog-tray must have mode 0755");

  const elf = fs.readFileSync(helper);
  assert.deepEqual(elf.subarray(0, 6), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]), "helper must be ELF64 little-endian");
  assert.equal(elf.readUInt16LE(18), 62, "helper must target x86-64");
  assert.deepEqual(dynamicValues(helper, "RUNPATH"), ["$ORIGIN/../lib"]);
  assert.equal(dynamicValues(helper, "RPATH").length, 0, "helper must not contain RPATH");
  const marker = run("readelf", ["--string-dump=.agentlog.protocol", helper]);
  assert.match(marker, new RegExp(`\\b${PROTOCOL_MARKER}\\b`));
  return helper;
}

function verifyIcons(stagingRoot) {
  const iconRoot = path.join(stagingRoot, "icons");
  assertNoSymlinks(iconRoot, "icons");
  const stagedTheme = path.join(iconRoot, "hicolor", ICON_THEME_FILE);
  const sourceTheme = path.join(projectRoot, "assets", "tray-icons", "hicolor", ICON_THEME_FILE);
  assertRealFile(stagedTheme, path.join("icons", "hicolor", ICON_THEME_FILE));
  assert.ok(fs.readFileSync(stagedTheme).equals(fs.readFileSync(sourceTheme)), `${ICON_THEME_FILE} differs from its stable source asset`);
  for (const size of ICON_SIZES) {
    for (const name of ICON_NAMES) {
      const relative = path.join(`${size}x${size}`, "status", name);
      const staged = path.join(stagingRoot, "icons", "hicolor", relative);
      const source = path.join(projectRoot, "assets", "tray-icons", "hicolor", relative);
      assertRealFile(staged, path.join("icons", "hicolor", relative));
      inspectPng(staged, size);
      assert.ok(fs.readFileSync(staged).equals(fs.readFileSync(source)), `${relative} differs from its stable source asset`);
    }
  }
}

function verifyLibraries(stagingRoot, helper) {
  const libraryRoot = path.join(stagingRoot, "lib");
  const realLibraryRoot = fs.realpathSync(libraryRoot);
  const entries = fs.readdirSync(libraryRoot, { withFileTypes: true });
  assert.equal(entries.length, BUNDLED_LIBRARIES.length * 2, "lib must contain exactly five real files and five SONAME links");
  for (const entry of entries) {
    assert.ok(entry.isFile() || entry.isSymbolicLink(), `${entry.name} must be a file or symlink`);
  }

  const realEntries = entries.filter((entry) => entry.isFile());
  const linkEntries = entries.filter((entry) => entry.isSymbolicLink());
  assert.equal(realEntries.length, BUNDLED_LIBRARIES.length, "lib must contain exactly five real library files");
  assert.deepEqual(
    linkEntries.map((entry) => entry.name).sort(),
    BUNDLED_LIBRARIES.map(({ soname }) => soname).sort(),
    "lib must contain exactly the required SONAME links",
  );

  for (const { family, soname } of BUNDLED_LIBRARIES) {
    const matchingReal = realEntries.filter((entry) => entry.name.startsWith(family));
    assert.equal(matchingReal.length, 1, `${family} must have exactly one real library`);
    const real = matchingReal[0];
    const realFile = path.join(libraryRoot, real.name);
    assert.deepEqual(dynamicValues(realFile, "SONAME"), [soname], `${real.name} must declare ${soname}`);

    const linkFile = path.join(libraryRoot, soname);
    const target = fs.readlinkSync(linkFile);
    assert.equal(path.isAbsolute(target), false, `${soname} must use a relative symlink`);
    assert.equal(target, real.name, `${soname} must target ${real.name}`);
    const resolved = fs.realpathSync(linkFile);
    assert.ok(resolved.startsWith(`${realLibraryRoot}${path.sep}`), `${soname} resolves outside lib`);
    assert.equal(resolved, fs.realpathSync(realFile), `${soname} must target ${real.name}`);
  }

  const output = run("ldd", [helper], {
    env: { ...process.env, LD_LIBRARY_PATH: libraryRoot },
  });
  assert.doesNotMatch(output, /not found/, "all helper dependencies must resolve");
  const resolutions = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\S+)\s+=>\s+(\S+)/);
    if (match) resolutions.set(match[1], match[2]);
  }
  for (const { soname } of BUNDLED_LIBRARIES) {
    const resolved = resolutions.get(soname);
    assert.ok(resolved, `${soname} is absent from ldd output`);
    assert.ok(fs.realpathSync(resolved).startsWith(`${realLibraryRoot}${path.sep}`), `${soname} did not resolve from staging`);
  }
}

function verifyNotice(stagingRoot) {
  const noticeFile = path.join(stagingRoot, "NOTICE");
  assertRealFile(noticeFile, "NOTICE");
  const notice = fs.readFileSync(noticeFile, "utf8");
  for (const required of [
    "Mobi Agent Pet Native Linux Tray Helper",
    "libayatana-appindicator",
    "libayatana-indicator",
    "libdbusmenu",
    "JSON-GLib",
    "GPL-3",
    "LGPL-2.1",
    "LGPL-3",
  ]) {
    assert.ok(notice.includes(required), `NOTICE is missing ${required}`);
  }
}

function verifyChecksums(stagingRoot) {
  const checksumPath = path.join(stagingRoot, "SHA256SUMS");
  assertRealFile(checksumPath, "SHA256SUMS");
  const lines = fs.readFileSync(checksumPath, "utf8").trimEnd().split("\n");
  const listed = new Map();
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64})  ([^/].*)$/);
    assert.ok(match, `invalid SHA256SUMS line: ${line}`);
    assert.equal(path.isAbsolute(match[2]), false, "checksum paths must be relative");
    assert.equal(match[2].split("/").includes(".."), false, "checksum paths must remain in staging");
    assert.equal(listed.has(match[2]), false, `duplicate checksum entry: ${match[2]}`);
    listed.set(match[2], match[1]);
  }

  const inventory = regularFileInventory(stagingRoot);
  assert.deepEqual([...listed.keys()].sort(), inventory, "SHA256SUMS must cover every staged regular file");
  for (const relative of inventory) {
    const digest = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(stagingRoot, relative)))
      .digest("hex");
    assert.equal(listed.get(relative), digest, `checksum mismatch for ${relative}`);
  }
}

function verifyNoBuildPaths(stagingRoot) {
  const forbiddenPrefixes = [
    projectRoot,
    stagingRoot,
    process.env.HOME,
    process.env.SYSROOT,
  ].filter(Boolean);
  for (const relative of regularFileInventory(stagingRoot)) {
    const payload = fs.readFileSync(path.join(stagingRoot, relative));
    assert.equal(payload.includes(Buffer.from("/home/")), false, `${relative} contains an absolute home path`);
    for (const prefix of forbiddenPrefixes) {
      assert.equal(payload.includes(Buffer.from(prefix)), false, `${relative} contains build path ${prefix}`);
    }
  }
}

function main() {
  if (process.argv.length !== 3) throw new Error("usage: verify-linux-tray-bundle.cjs <staging-root>");
  const stagingRoot = path.resolve(process.argv[2]);
  assert.ok(fs.statSync(stagingRoot).isDirectory(), `${stagingRoot} must be a directory`);
  verifyTopLevel(stagingRoot);
  const helper = verifyHelper(stagingRoot);
  verifyIcons(stagingRoot);
  verifyLibraries(stagingRoot, helper);
  verifyNotice(stagingRoot);
  verifyChecksums(stagingRoot);
  verifyNoBuildPaths(stagingRoot);
  process.stdout.write(`Verified Linux tray bundle: ${stagingRoot}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`verify-linux-tray-bundle: ${error.message}\n`);
  process.exitCode = 1;
}
