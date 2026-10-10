"use strict";

// Adapted from CC Switch live/project/codex.rs, preserving unrelated TOML text.
// Copyright (c) 2025 Jason Young; MIT license in THIRD_PARTY_NOTICES.md.
const { parse } = require("smol-toml");

const TOP_FIELDS = new Set([
  "model_provider", "openai_base_url", "model", "review_model", "model_reasoning_effort",
  "plan_mode_reasoning_effort", "disable_response_storage", "model_catalog_json",
  "experimental_bearer_token", "base_url", "wire_api",
]);

function parseToml(text) {
  try { return text.trim() ? parse(text) : {}; }
  catch { throw new Error("Invalid Codex config.toml"); }
}

function sectionStart(line) { return /^\s*\[/.test(line); }
function sectionName(line) {
  const match = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
  return match ? match[1].trim() : null;
}

function patchCodexToml(currentText, targetText) {
  parseToml(currentText);
  parseToml(targetText);
  const current = currentText.split("\n");
  const target = targetText.split("\n");
  const kept = [];
  let inTop = true;
  let inCustom = false;
  for (const line of current) {
    if (sectionStart(line)) {
      inTop = false;
      inCustom = sectionName(line) === "model_providers.custom";
    }
    if (inCustom) continue;
    if (inTop) {
      const key = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/)?.[1];
      if (key && TOP_FIELDS.has(key)) continue;
    }
    kept.push(line);
  }

  const topLines = [];
  const customLines = [];
  let targetTop = true;
  let targetCustom = false;
  for (const line of target) {
    if (sectionStart(line)) {
      targetTop = false;
      targetCustom = sectionName(line) === "model_providers.custom";
    }
    if (targetCustom) customLines.push(line);
    else if (targetTop) {
      const key = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/)?.[1];
      if (key && TOP_FIELDS.has(key)) topLines.push(line);
    }
  }
  const firstSection = kept.findIndex(sectionStart);
  const insertion = firstSection === -1 ? kept.length : firstSection;
  kept.splice(insertion, 0, ...topLines);
  const result = kept.join("\n").trimEnd();
  const custom = customLines.join("\n").trimEnd();
  const next = `${result}${custom ? `${result ? "\n\n" : ""}${custom}` : ""}${result || custom ? "\n" : ""}`;
  parseToml(next);
  return next;
}

module.exports = { patchCodexToml, parseToml };
