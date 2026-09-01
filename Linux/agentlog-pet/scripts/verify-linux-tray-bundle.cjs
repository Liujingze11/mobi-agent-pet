"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const projectRoot = path.resolve(__dirname, "..");
const PROTOCOL_MARKER = "agentlog-tray-protocol-v1";
const BUNDLED_SONAME_PREFIXES = [
  "libayatana-appindicator3.so",
  "libayatana-indicator3.so",
  "libdbusmenu-glib.so",
  "libdbusmenu-gtk3.so",
  "libjson-glib-1.0.so",
];
const ICON_NAMES = ["agentlog-pet.png", "agentlog-pet-attention.png"];
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

function regularFileInventory(root) {
  const files = [];
  function visit(relative) {
    const absolute = path.join(root, relative);
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

function verifyTopLevel(stagingRoot) {
  const actual = fs.readdirSync(stagingRoot).sort();
  assert.deepEqual(actual, ["NOTICE", "SHA256SUMS", "bin", "icons", "lib"]);
  for (const directory of ["bin", "lib", path.join("icons", "hicolor")]) {
    assert.ok(fs.statSync(path.join(stagingRoot, directory)).isDirectory(), `${directory} must be a directory`);
  }
}

function verifyHelper(stagingRoot) {
  const helper = path.join(stagingRoot, "bin", "agentlog-tray");
  const stat = fs.statSync(helper);
  assert.ok(stat.isFile(), "bin/agentlog-tray must be a regular file");
  assert.ok((stat.mode & 0o111) !== 0, "bin/agentlog-tray must have executable permission");

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
  for (const size of ICON_SIZES) {
    for (const name of ICON_NAMES) {
      const relative = path.join(`${size}x${size}`, "status", name);
      const staged = path.join(stagingRoot, "icons", "hicolor", relative);
      const source = path.join(projectRoot, "assets", "tray-icons", "hicolor", relative);
      inspectPng(staged, size);
      assert.ok(fs.readFileSync(staged).equals(fs.readFileSync(source)), `${relative} differs from its stable source asset`);
    }
  }
}

function verifyLibraries(stagingRoot, helper) {
  const libraryRoot = path.join(stagingRoot, "lib");
  const realLibraryRoot = fs.realpathSync(libraryRoot);
  const entries = fs.readdirSync(libraryRoot, { withFileTypes: true });
  assert.ok(entries.length > 0, "lib must not be empty");
  for (const entry of entries) {
    assert.ok(entry.isFile() || entry.isSymbolicLink(), `${entry.name} must be a file or symlink`);
    if (entry.isSymbolicLink()) {
      assert.equal(
        path.isAbsolute(fs.readlinkSync(path.join(libraryRoot, entry.name))),
        false,
        `${entry.name} must use a relative symlink`,
      );
    }
    assert.ok(
      BUNDLED_SONAME_PREFIXES.some((prefix) => entry.name.startsWith(prefix)),
      `${entry.name} is outside the allowed SONAME families`,
    );
    const real = fs.realpathSync(path.join(libraryRoot, entry.name));
    assert.ok(real.startsWith(`${realLibraryRoot}${path.sep}`), `${entry.name} resolves outside lib`);
  }

  for (const prefix of BUNDLED_SONAME_PREFIXES) {
    assert.ok(entries.some((entry) => entry.name.startsWith(prefix)), `${prefix} is missing`);
  }
  for (const entry of entries.filter((candidate) => candidate.isFile())) {
    const sonames = dynamicValues(path.join(libraryRoot, entry.name), "SONAME");
    assert.equal(sonames.length, 1, `${entry.name} must contain one SONAME`);
    assert.ok(fs.existsSync(path.join(libraryRoot, sonames[0])), `${sonames[0]} is missing`);
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
  for (const prefix of BUNDLED_SONAME_PREFIXES) {
    const match = [...resolutions].find(([soname]) => soname.startsWith(prefix));
    assert.ok(match, `${prefix} is absent from ldd output`);
    assert.ok(fs.realpathSync(match[1]).startsWith(`${realLibraryRoot}${path.sep}`), `${match[0]} did not resolve from staging`);
  }
}

function verifyNotice(stagingRoot) {
  const notice = fs.readFileSync(path.join(stagingRoot, "NOTICE"), "utf8");
  for (const required of [
    "AgentLog Native Linux Tray Helper",
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
  const files = [path.join(stagingRoot, "bin", "agentlog-tray")];
  const libraryRoot = path.join(stagingRoot, "lib");
  for (const entry of fs.readdirSync(libraryRoot, { withFileTypes: true })) {
    if (entry.isFile()) files.push(path.join(libraryRoot, entry.name));
  }
  const forbiddenPrefixes = [
    projectRoot,
    stagingRoot,
    process.env.HOME,
    process.env.SYSROOT,
  ].filter(Boolean);
  for (const file of files) {
    const strings = run("strings", ["--all", file]);
    assert.doesNotMatch(strings, /\/home\//, `${file} contains an absolute home path`);
    for (const prefix of forbiddenPrefixes) {
      assert.equal(strings.includes(prefix), false, `${file} contains build path ${prefix}`);
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
