"use strict";

const HIDDEN_CUES = new Set(["sweeping", "carrying"]);

function shouldSuppressPetCue(stateKey) {
  return HIDDEN_CUES.has(stateKey);
}

module.exports = { shouldSuppressPetCue };
