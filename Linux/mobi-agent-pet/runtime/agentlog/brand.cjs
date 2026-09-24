"use strict";

const path = require("node:path");

const BRAND = Object.freeze({
  packageName: "mobi-agent-pet",
  productName: "Mobi Agent Pet",
  chineseName: "莫比 Pet",
  legacyUserDataName: "AgentLog Pet",
  tagline: "Your Private AI Agent Work Journal",
  appId: "com.agentlog.pet",
  repositoryUrl: "https://github.com/Liujingze11/mobi-agent-pet",
  authorName: "Liujingze11",
  compatibilityProtocol: "clawd",
});

function rebrandText(value, locale = "en") {
  if (typeof value !== "string") return value;
  const productName = locale === "zh" || locale === "zh-TW" ? BRAND.chineseName : BRAND.productName;
  return value
    .replaceAll("Clawd on Desk", productName)
    .replace(/\bClawd\b/g, productName);
}

function legacyUserDataPath(appDataPath) {
  return path.join(appDataPath, BRAND.legacyUserDataName);
}

function rebrandTree(value, seen = new WeakMap(), locale = "en") {
  if (typeof value === "string") return rebrandText(value, locale);
  if (typeof value === "function") {
    return (...args) => rebrandText(value(...args), locale);
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);

  const output = Array.isArray(value) ? [] : {};
  seen.set(value, output);
  for (const [key, child] of Object.entries(value)) {
    output[key] = rebrandTree(child, seen, key === "zh" || key === "zh-TW" ? key : locale);
  }
  return output;
}

module.exports = { BRAND, legacyUserDataPath, rebrandText, rebrandTree };
