"use strict";

(function installAgentLogBrand(root) {
  function rebrandText(value, locale = "en") {
    if (typeof value !== "string") return value;
    const productName = locale === "zh" || locale === "zh-TW" ? "莫比 Pet" : "Mobi Agent Pet";
    return value
      .replaceAll("Clawd on Desk", productName)
      .replace(/\bClawd\b/g, productName);
  }

  function rebrandTree(value, seen = new WeakMap(), locale = "en") {
    if (typeof value === "string") return rebrandText(value, locale);
    if (typeof value === "function") return (...args) => rebrandText(value(...args), locale);
    if (!value || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    const output = Array.isArray(value) ? [] : {};
    seen.set(value, output);
    for (const [key, child] of Object.entries(value)) {
      output[key] = rebrandTree(child, seen, key === "zh" || key === "zh-TW" ? key : locale);
    }
    return output;
  }

  root.AgentLogBrand = Object.freeze({
    productName: "Mobi Agent Pet",
    chineseName: "莫比 Pet",
    tagline: "Your Private AI Agent Work Journal",
    rebrandText,
    rebrandTree,
  });
})(globalThis);
