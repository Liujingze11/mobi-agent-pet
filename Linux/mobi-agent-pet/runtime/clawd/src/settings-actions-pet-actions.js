"use strict";
const { normalizePlan } = require("./pet-action-plan");
function setPetActionPlan(payload, deps = {}) {
  const { themeId, plan } = payload || {};
  if (typeof themeId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(themeId)) return { status: "error", message: "Invalid theme" };
  const clean = plan === null ? null : normalizePlan(plan);
  if (plan !== null && !clean) return { status: "error", message: "Invalid action plan: keep an idle action enabled and use durations from 0.5 to 60 seconds" };
  try {
    if (clean && (typeof deps.validatePetActionFiles !== "function" || !deps.validatePetActionFiles(themeId, clean))) return { status: "error", message: "Action file unavailable in this theme" };
  } catch (error) {
    return { status: "error", message: error.message };
  }
  const snapshot = deps.snapshot || {}, overrides = { ...snapshot.themeOverrides || {} };
  const themeMap = { ...overrides[themeId] || {} };
  if (clean) themeMap.actionPlan = clean;
  else delete themeMap.actionPlan;
  if (JSON.stringify(themeMap) === JSON.stringify(overrides[themeId] || {})) return { status: "ok", noop: true };
  if (snapshot.theme === themeId) {
    if (typeof deps.activateTheme !== "function") return { status: "error", message: "Theme activation unavailable" };
    try {
      deps.activateTheme(themeId, null, themeMap);
    } catch (error) {
      return { status: "error", message: error.message };
    }
  }
  if (Object.keys(themeMap).length) overrides[themeId] = themeMap;
  else delete overrides[themeId];
  return { status: "ok", commit: { themeOverrides: overrides } };
}
module.exports = { setPetActionPlan };
