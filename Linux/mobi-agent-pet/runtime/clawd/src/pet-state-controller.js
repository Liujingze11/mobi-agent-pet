"use strict";
const { isPetState } = require("./pet-states");
const { playbackSlot, playbackDuration } = require("./pet-action-plan");

function createPetStateController({ resolveTaskState = () => "idle", getPlan, publish = () => {},
  getAllowedStates = () => null, fallbackDisabledStates = () => false, timers = globalThis } = {}) {
  let state = "idle", latest = "idle", held = false, timer = null;
  let themeGeneration = 0, stateRevision = 0, active = true, epoch = 0, timedRevision = -1;
  const getSnapshot = () => ({ state, themeGeneration, stateRevision });
  function cancel() { epoch++; if (timer !== null) timers.clearTimeout(timer); timer = null; }
  function allowed(value) {
    const states = getAllowedStates();
    if (!states || states.includes(value)) return value;
    const resolved = resolveTaskState();
    return resolved === "working" && states.includes("working") ? "working" : "idle";
  }
  function schedule(duration) {
    cancel(); const ticket = epoch;
    timer = timers.setTimeout(() => {
      if (!active || ticket !== epoch) return;
      timer = null;
      const resolved = resolveTaskState();
      request(isPetState(resolved) && !["complete", "error", "held"].includes(resolved) ? resolved : "idle", { force: true });
    }, duration);
  }
  function commit(next, force = false) {
    if (state === next && !force) return;
    cancel(); state = next; stateRevision++;
    publish(getSnapshot());
    if (["complete", "error"].includes(state)) schedule(playbackDuration(getPlan(), state));
  }
  function request(next, options = {}) {
    if (!active || !isPetState(next) || next === "held") return false;
    const permitted = getAllowedStates();
    const denied = permitted && !permitted.includes(next);
    if (denied && !fallbackDisabledStates()) return false;
    latest = next;
    if (!held) {
      if (!options.force && ["complete", "error"].includes(state) && next === "idle") return true;
      if (!options.force && next === "complete" && ["waiting", "error"].includes(state)) return true;
      commit(allowed(next), options.force === true || !!denied);
    }
    return true;
  }
  function setHeld(value) {
    if (!active || held === !!value) return;
    const permitted = getAllowedStates();
    if (value && permitted && !permitted.includes("held")) return;
    held = !!value;
    const restored = latest === "roam" ? resolveTaskState() : latest;
    commit(held ? "held" : allowed(isPetState(restored) ? restored : "idle"));
  }
  function refreshPlan() {
    active = true; themeGeneration++; held = false;
    commit(allowed(latest), true);
  }
  function reportFrame(frame) {
    if (!active || !frame || frame.state !== state || frame.themeGeneration !== themeGeneration || frame.stateRevision !== stateRevision) return false;
    const permitted = getAllowedStates();
    if (permitted && !permitted.includes(state)) return false;
    const slot = playbackSlot(getPlan(), state);
    const action = slot.actions.find(a => a.enabled && a.file === frame.file);
    if (!action) return false;
    if (["complete", "error"].includes(state) && slot.mode === "random" && timedRevision !== stateRevision) {
      timedRevision = stateRevision; schedule(action.durationMs);
    }
    return true;
  }
  return { getState: () => state, getSnapshot, request, setHeld, refreshPlan, reportFrame,
    cleanup() { active = false; held = false; cancel(); } };
}
module.exports = { createPetStateController };
