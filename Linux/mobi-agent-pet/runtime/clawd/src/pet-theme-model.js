"use strict";
const model = require("./pet-action-plan");
const { PET_STATE_IDS } = require("./pet-states");

function normalizePetTheme(theme) {
  if (theme._defaultPetActionPlan) return theme;
  const defaults = model.defaultPlan(theme);
  const sourceAssets = model.collectActionFiles(theme);
  theme._sourcePetAssets = sourceAssets;
  theme._defaultPetActionPlan = defaults;
  // Kept only as source-resource metadata for old themes and import tools.
  theme._sourcePetBindings = { ...theme.states };
  theme._sourcePetStateBindings = theme._stateBindings;
  theme.states = Object.fromEntries(PET_STATE_IDS.map(id => [id, defaults.states[id].actions.map(a => a.file)]));
  theme._stateBindings = Object.fromEntries(PET_STATE_IDS.map(id => [id, {
    files: theme.states[id], fallbackTo: theme.states[id].length ? null : "idle",
  }]));
  return theme;
}
module.exports = { normalizePetTheme };
