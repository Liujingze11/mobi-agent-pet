"use strict";

// Reuses the approved solid-yellow attention icon as the status-light shape.
// Green and red retain its exact geometry; yellow retains its exact bytes.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const iconRoot = path.join(root, "assets", "tray-icons", "hicolor");
const colors = {
  working: [53, 208, 127],
  error: [233, 101, 101],
};

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
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBytes.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return result;
}

function unfilter(raw, width, height, channels) {
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[offset++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[offset++];
      const left = x >= channels ? pixels[rowStart + x - channels] : 0;
      const above = y > 0 ? pixels[rowStart + x - stride] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[rowStart + x - stride - channels] : 0;
      let result = value;
      if (filter === 1) result += left;
      else if (filter === 2) result += above;
      else if (filter === 3) result += Math.floor((left + above) / 2);
      else if (filter === 4) {
        const estimate = left + above - upperLeft;
        const pa = Math.abs(estimate - left);
        const pb = Math.abs(estimate - above);
        const pc = Math.abs(estimate - upperLeft);
        result += pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft;
      } else if (filter !== 0) {
        throw new Error(`unsupported PNG filter ${filter}`);
      }
      pixels[rowStart + x] = result & 0xff;
    }
  }
  return pixels;
}

function readPng(file) {
  const input = fs.readFileSync(file);
  let offset = 8;
  let width;
  let height;
  let colorType;
  const compressed = [];
  while (offset < input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString("ascii", offset + 4, offset + 8);
    const data = input.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || ![2, 6].includes(data[9]) || data[12] !== 0) {
        throw new Error(`unsupported PNG format: ${file}`);
      }
      colorType = data[9];
    } else if (type === "IDAT") compressed.push(data);
    else if (type === "IEND") break;
  }
  const channels = colorType === 6 ? 4 : 3;
  const filtered = zlib.inflateSync(Buffer.concat(compressed));
  const source = unfilter(filtered, width, height, channels);
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = source[index * channels];
    rgba[index * 4 + 1] = source[index * channels + 1];
    rgba[index * 4 + 2] = source[index * channels + 2];
    rgba[index * 4 + 3] = colorType === 6 ? source[index * channels + 3] : 255;
  }
  return { width, height, rgba };
}

function fillSolidShape(image, color) {
  for (let index = 0; index < image.rgba.length; index += 4) {
    if (image.rgba[index + 3] === 0) continue;
    image.rgba[index] = color[0];
    image.rgba[index + 1] = color[1];
    image.rgba[index + 2] = color[2];
  }
}

function encodePng(image) {
  const rows = Buffer.alloc(image.height * (1 + image.width * 4));
  for (let y = 0; y < image.height; y += 1) {
    const row = y * (1 + image.width * 4);
    rows[row] = 0;
    image.rgba.copy(rows, row + 1, y * image.width * 4, (y + 1) * image.width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 22, 32, 48]) {
  const directory = path.join(iconRoot, `${size}x${size}`, "status");
  const approvedYellow = fs.readFileSync(path.join(directory, "agentlog-pet-attention.png"));
  for (const name of ["agentlog-pet-question.png", "agentlog-pet-question-panel.png"]) {
    fs.writeFileSync(path.join(directory, name), approvedYellow);
  }

  const questionSource = readPng(path.join(directory, "agentlog-pet-attention.png"));
  for (const [status, color] of Object.entries(colors)) {
    const image = {
      width: questionSource.width,
      height: questionSource.height,
      rgba: Buffer.from(questionSource.rgba),
    };
    fillSolidShape(image, color);
    const encoded = encodePng(image);
    for (const name of [`agentlog-pet-${status}.png`, `agentlog-pet-${status}-panel.png`]) {
      fs.writeFileSync(path.join(directory, name), encoded);
    }
  }
}
