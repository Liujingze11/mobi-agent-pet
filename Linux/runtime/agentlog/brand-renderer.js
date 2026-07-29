"use strict";

(function installAgentLogBrand(root) {
  function rebrandText(value) {
    if (typeof value !== "string") return value;
    return value
      .replaceAll("Clawd on Desk", "AgentLog Pet")
      .replace(/\bClawd\b/g, "AgentLog Pet");
  }

  function rebrandTree(value, seen = new WeakMap()) {
    if (typeof value === "string") return rebrandText(value);
    if (typeof value === "function") return (...args) => rebrandText(value(...args));
    if (!value || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    const output = Array.isArray(value) ? [] : {};
    seen.set(value, output);
    for (const [key, child] of Object.entries(value)) {
      output[key] = rebrandTree(child, seen);
    }
    return output;
  }

  root.AgentLogBrand = Object.freeze({
    productName: "AgentLog Pet",
    tagline: "Your Private AI Agent Work Journal",
    rebrandText,
    rebrandTree,
  });
})(globalThis);
