"use strict";

const fs = require("node:fs");
const path = require("node:path");

function normalizeProjectPath(input, fsApi = fs) {
  if (typeof input !== "string" || !input.trim()) {
    throw new TypeError("project path is required");
  }

  const absolute = path.resolve(input.trim());
  let canonicalPath = absolute;
  let isAvailable = false;
  try {
    const realpath = fsApi.realpathSync.native || fsApi.realpathSync;
    canonicalPath = realpath(absolute);
    isAvailable = fsApi.statSync(canonicalPath).isDirectory();
  } catch {}

  return { path: absolute, canonicalPath, isAvailable };
}

module.exports = { normalizeProjectPath };
