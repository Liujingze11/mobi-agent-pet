"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldSuppressPetCue } = require("../src/pet-cue-policy");

test("required pet cues remain enabled despite retired theme switch values", () => {
  for (const state of ["error", "notification", "attention"]) {
    assert.equal(shouldSuppressPetCue(state, { disabled: true }), false, state);
  }
});

test("context sweep and worktree carrying cues stay hidden", () => {
  for (const state of ["sweeping", "carrying"]) {
    assert.equal(shouldSuppressPetCue(state), true, state);
  }
});
