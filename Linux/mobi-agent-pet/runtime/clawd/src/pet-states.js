"use strict";
(function(root) {
  const PET_STATE_IDS = Object.freeze(["idle", "roam", "working", "waiting", "complete", "error", "held"]);
  const ids = new Set(PET_STATE_IDS);
  // These names describe upstream events or legacy resources, never pet state.
  const aliases = Object.freeze({
    thinking: "working", juggling: "working", sweeping: "working", carrying: "working",
    notification: "waiting", attention: "complete", drag: "held",
    yawning: "idle", dozing: "idle", collapsing: "idle", sleeping: "idle", waking: "idle", dizzy: "idle",
    "mini-idle": "idle", "mini-enter": "idle", "mini-enter-sleep": "idle", "mini-peek": "idle", "mini-sleep": "idle",
    "mini-working": "working", "mini-alert": "waiting", "mini-happy": "complete", "mini-crabwalk": "roam",
  });
  const PET_STATE_PRIORITY = Object.freeze({ idle: 0, roam: 1, working: 2, complete: 3, waiting: 4, error: 5, held: 6 });
  function isPetState(value) { return ids.has(value); }
  function normalizePetState(value) { return isPetState(value) ? value : (Object.hasOwn(aliases, value) ? aliases[value] : null); }
  const api = { PET_STATE_IDS, PET_STATE_PRIORITY, isPetState, normalizePetState };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MobiPetStates = api;
})(globalThis);
