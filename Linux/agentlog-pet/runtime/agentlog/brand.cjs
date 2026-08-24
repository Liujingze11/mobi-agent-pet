"use strict";

const BRAND = Object.freeze({
  packageName: "agentlog-pet",
  productName: "AgentLog Pet",
  tagline: "Your Private AI Agent Work Journal",
  appId: "com.agentlog.pet",
  repositoryUrl: "https://github.com/Liujingze11/agentlog-pet",
  authorName: "Liujingze11",
  compatibilityProtocol: "clawd",
});

function rebrandText(value) {
  if (typeof value !== "string") return value;
  return value
    .replaceAll("Clawd on Desk", BRAND.productName)
    .replace(/\bClawd\b/g, BRAND.productName);
}

function rebrandTree(value, seen = new WeakMap()) {
  if (typeof value === "string") return rebrandText(value);
  if (typeof value === "function") {
    return (...args) => rebrandText(value(...args));
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);

  const output = Array.isArray(value) ? [] : {};
  seen.set(value, output);
  for (const [key, child] of Object.entries(value)) {
    output[key] = rebrandTree(child, seen);
  }
  return output;
}

module.exports = { BRAND, rebrandText, rebrandTree };
