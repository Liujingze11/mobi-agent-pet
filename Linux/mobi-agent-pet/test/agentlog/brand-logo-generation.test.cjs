"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..", "..");
const GENERATOR = path.join(ROOT, "scripts", "generate-brand-logo.cjs");
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

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

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), data.length + 8);
  return output;
}

function encodeRgba(width, height, rgba) {
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    rows[row] = 0;
    rgba.copy(rows, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function decodeGeneratedPng(file) {
  const png = fs.readFileSync(file);
  let offset = 8;
  let width = 0;
  let height = 0;
  const compressed = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === "IDAT") compressed.push(data);
    else if (type === "IEND") break;
  }
  const rows = zlib.inflateSync(Buffer.concat(compressed));
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    assert.equal(rows[row], 0, "generated PNG should use deterministic unfiltered rows");
    rows.copy(rgba, y * width * 4, row + 1, row + 1 + width * 4);
  }
  return { width, height, rgba };
}

function pixel(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return [...image.rgba.subarray(offset, offset + 4)];
}

test("brand generator thickens a hollow mark outward without moving its inner edge", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "agentlog-brand-logo-"));
  try {
    const input = path.join(temporary, "input.png");
    const output = path.join(temporary, "output.png");
    const width = 25;
    const height = 25;
    const rgba = Buffer.alloc(width * height * 4);
    const center = 12;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const radius = Math.hypot(x - center, y - center);
        if (radius < 3 || radius > 8.1) continue;
        const offset = (y * width + x) * 4;
        rgba.set(radius >= 7.5 ? [31, 208, 255, 255] : [23, 111, 222, 255], offset);
      }
    }
    fs.writeFileSync(input, encodeRgba(width, height, rgba));

    const result = spawnSync(process.execPath, [
      GENERATOR,
      "--input", input,
      "--output", output,
      "--outward-pixels", "2",
    ], { cwd: ROOT, encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const generated = decodeGeneratedPng(output);
    assert.deepEqual([generated.width, generated.height], [25, 25]);
    assert.deepEqual(pixel(generated, 15, 12), [23, 111, 222, 255], "inner ring edge changes");
    assert.deepEqual(pixel(generated, 20, 12), [23, 111, 222, 255], "old outer outline remains visible");
    const movedOutline = pixel(generated, 22, 12);
    assert.ok(
      movedOutline.every((value, index) => Math.abs(value - [31, 208, 255, 255][index]) <= 3),
      "outer outline did not move",
    );
    assert.equal(pixel(generated, 12, 12)[3], 0, "inner opening became smaller");
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
