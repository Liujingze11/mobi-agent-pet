"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

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

function unfilter(raw, width, height) {
  const channels = 4;
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
  if (!input.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("input must be a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  const compressed = [];
  while (offset < input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString("ascii", offset + 4, offset + 8);
    const data = input.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error("input must be a non-interlaced 8-bit RGBA PNG");
      }
    } else if (type === "IDAT") compressed.push(data);
    else if (type === "IEND") break;
  }
  if (!width || !height || compressed.length === 0) throw new Error("input PNG is incomplete");
  return {
    width,
    height,
    rgba: unfilter(zlib.inflateSync(Buffer.concat(compressed)), width, height),
  };
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
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function alphaBounds(image) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.rgba[(y * image.width + x) * 4 + 3] < 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) throw new Error("input PNG contains no visible pixels");
  return { minX, minY, maxX, maxY };
}

function samplePremultiplied(image, x, y) {
  if (x < 0 || y < 0 || x > image.width - 1 || y > image.height - 1) return [0, 0, 0, 0];
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, image.width - 1);
  const y1 = Math.min(y0 + 1, image.height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const samples = [
    [x0, y0, (1 - fx) * (1 - fy)],
    [x1, y0, fx * (1 - fy)],
    [x0, y1, (1 - fx) * fy],
    [x1, y1, fx * fy],
  ];
  let alpha = 0;
  const premultiplied = [0, 0, 0];
  for (const [sampleX, sampleY, weight] of samples) {
    const offset = (sampleY * image.width + sampleX) * 4;
    const sampleAlpha = image.rgba[offset + 3] / 255;
    alpha += sampleAlpha * weight;
    for (let channel = 0; channel < 3; channel += 1) {
      premultiplied[channel] += image.rgba[offset + channel] * sampleAlpha * weight;
    }
  }
  if (alpha === 0) return [0, 0, 0, 0];
  return [
    Math.round(premultiplied[0] / alpha),
    Math.round(premultiplied[1] / alpha),
    Math.round(premultiplied[2] / alpha),
    Math.round(alpha * 255),
  ];
}

function buildRadialProfile(image, centerX, centerY, radius) {
  const binCount = Math.max(180, Math.ceil(Math.PI * radius));
  const inner = new Float64Array(binCount);
  const outer = new Float64Array(binCount);
  inner.fill(Number.POSITIVE_INFINITY);
  outer.fill(-1);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.rgba[(y * image.width + x) * 4 + 3] < 8) continue;
      const dx = x - centerX;
      const dy = y - centerY;
      const angle = Math.atan2(dy, dx);
      const bin = Math.min(
        binCount - 1,
        Math.floor((angle + Math.PI) / (Math.PI * 2) * binCount),
      );
      const pixelRadius = Math.hypot(dx, dy);
      inner[bin] = Math.min(inner[bin], pixelRadius);
      outer[bin] = Math.max(outer[bin], pixelRadius);
    }
  }

  const occupied = [];
  for (let index = 0; index < binCount; index += 1) {
    if (outer[index] >= 0) occupied.push(index);
  }
  if (occupied.length === 0) throw new Error("input PNG contains no visible pixels");
  for (let occupiedIndex = 0; occupiedIndex < occupied.length; occupiedIndex += 1) {
    const left = occupied[occupiedIndex];
    const right = occupied[(occupiedIndex + 1) % occupied.length];
    const distance = (right - left + binCount) % binCount;
    for (let step = 1; step < distance; step += 1) {
      const index = (left + step) % binCount;
      const amount = step / distance;
      inner[index] = inner[left] + (inner[right] - inner[left]) * amount;
      outer[index] = outer[left] + (outer[right] - outer[left]) * amount;
    }
  }

  function smooth(values) {
    let current = Float64Array.from(values);
    for (let pass = 0; pass < 3; pass += 1) {
      const next = new Float64Array(binCount);
      for (let index = 0; index < binCount; index += 1) {
        next[index] = (
          current[(index - 2 + binCount) % binCount]
          + current[(index - 1 + binCount) % binCount] * 2
          + current[index] * 3
          + current[(index + 1) % binCount] * 2
          + current[(index + 2) % binCount]
        ) / 9;
      }
      current = next;
    }
    return current;
  }

  return { inner: smooth(inner), outer: smooth(outer) };
}

function sampleCircular(values, position) {
  const base = Math.floor(position) % values.length;
  const amount = position - Math.floor(position);
  return values[base] * (1 - amount) + values[(base + 1) % values.length] * amount;
}

function expandOutward(image, outwardPixels) {
  const bounds = alphaBounds(image);
  const centerX = (image.width - 1) / 2;
  const centerY = (image.height - 1) / 2;
  const radius = Math.max(
    centerX - bounds.minX,
    bounds.maxX - centerX,
    centerY - bounds.minY,
    bounds.maxY - centerY,
  );
  const radialProfile = buildRadialProfile(image, centerX, centerY, radius);
  const output = Buffer.alloc(image.rgba.length);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const dx = x - centerX;
      const dy = y - centerY;
      const pixelRadius = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const profilePosition = (angle + Math.PI) / (Math.PI * 2) * radialProfile.outer.length;
      const innerRadius = sampleCircular(radialProfile.inner, profilePosition);
      const outerRadius = sampleCircular(radialProfile.outer, profilePosition);
      if (pixelRadius < innerRadius) {
        image.rgba.copy(output, offset, offset, offset + 4);
        continue;
      }
      if (pixelRadius > outerRadius + outwardPixels + 1) continue;
      const thickness = outerRadius - innerRadius;
      const sourceRadius = thickness <= 0
        ? innerRadius
        : innerRadius + (pixelRadius - innerRadius) * thickness / (thickness + outwardPixels);
      const radialScale = pixelRadius === 0 ? 0 : sourceRadius / pixelRadius;
      const expanded = samplePremultiplied(
        image,
        dx * radialScale + centerX,
        dy * radialScale + centerY,
      );
      output.set(expanded, offset);
    }
  }
  return { width: image.width, height: image.height, rgba: output };
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !key.startsWith("--") || value === undefined) {
      throw new Error("usage: generate-brand-logo --input FILE --output FILE --outward-pixels N");
    }
    values.set(key, value);
  }
  const input = values.get("--input");
  const output = values.get("--output");
  const outwardPixels = Number(values.get("--outward-pixels"));
  if (!input || !output || !Number.isInteger(outwardPixels) || outwardPixels <= 0) {
    throw new Error("input, output, and a positive integer outward-pixels value are required");
  }
  return { input, output, outwardPixels };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const input = readPng(path.resolve(options.input));
  const output = expandOutward(input, options.outwardPixels);
  fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
  fs.writeFileSync(path.resolve(options.output), encodePng(output));
}

try {
  main();
} catch (error) {
  process.stderr.write(`generate-brand-logo: ${error.message}\n`);
  process.exitCode = 1;
}
