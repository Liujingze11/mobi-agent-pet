"use strict";

const TRAY_STATUS_ICONS = Object.freeze({
  idle: "agentlog-pet",
  working: "agentlog-pet-working",
  question: "agentlog-pet-question",
  error: "agentlog-pet-error",
});

const WORKING_STATES = new Set([
  "working",
  "thinking",
  "juggling",
  "mini-working",
]);

const NON_RESPONSE_EVENTS = new Set([
  "SessionStart", "SessionEnd", "Stop", "Notification", "PermissionRequest",
  "CodexUserInputRequest", "PermissionResult", "Interrupt", "event_msg:token_count",
]);

function hasPendingTrayQuestion(entries) {
  return Array.isArray(entries) && entries.some((entry) => entry != null);
}

function resolveTrayStatus({ state, hasPendingPermission = false, enabled = true } = {}) {
  if (enabled !== true) return "idle";
  if (state === "error") return "error";
  if (hasPendingPermission === true) return "question";
  if (WORKING_STATES.has(state)) return "working";
  return "idle";
}

function shouldPulseTrayForAgentEvent({ state, event, opts } = {}) {
  if (!WORKING_STATES.has(state) || !event || opts?.preserveState === true) return false;
  return !NON_RESPONSE_EVENTS.has(event);
}

function createTrayStatusLightController({
  setIcon,
  timers = globalThis,
  statusIntervalMs = 500,
  activityTimeoutMs = 12000,
  completionIntervalMs = 500,
  completionDurationMs = 3000,
} = {}) {
  if (typeof setIcon !== "function") throw new TypeError("setIcon must be a function");

  let status = "idle";
  let phase = "idle";
  let blinkInterval = null;
  let activityTimeout = null;
  let completionInterval = null;
  let completionTimeout = null;
  let lastIcon = null;

  function clearTimers() {
    if (blinkInterval !== null) timers.clearInterval(blinkInterval);
    if (activityTimeout !== null) timers.clearTimeout(activityTimeout);
    if (completionInterval !== null) timers.clearInterval(completionInterval);
    if (completionTimeout !== null) timers.clearTimeout(completionTimeout);
    blinkInterval = null;
    activityTimeout = null;
    completionInterval = null;
    completionTimeout = null;
  }

  function startBlink(nextStatus, expires) {
    clearTimers();
    status = nextStatus;
    phase = "blinking";
    let lightOn = true;
    render(status);
    blinkInterval = timers.setInterval(() => {
      lightOn = !lightOn;
      render(lightOn ? status : "idle");
    }, statusIntervalMs);
    if (expires) renewActivityDeadline();
  }

  function renewActivityDeadline() {
    if (activityTimeout !== null) timers.clearTimeout(activityTimeout);
    activityTimeout = timers.setTimeout(() => {
      clearTimers();
      phase = "quiet";
      render("idle");
    }, activityTimeoutMs);
  }

  function render(nextStatus) {
    const icon = TRAY_STATUS_ICONS[nextStatus] || TRAY_STATUS_ICONS.idle;
    if (icon === lastIcon) return;
    lastIcon = icon;
    setIcon(icon);
  }

  function setStatus(nextStatus) {
    const normalizedStatus = TRAY_STATUS_ICONS[nextStatus] ? nextStatus : "idle";
    const previousStatus = status;
    status = normalizedStatus;
    if (status === "idle") {
      if (phase === "completion" || phase === "acknowledged") return;
      clearTimers();
      phase = "idle";
      render("idle");
      return;
    }
    if (status === previousStatus) return;
    // Work needs a fresh agent event; visual state can outlive actual output.
    if (status === "working") {
      if (phase === "blinking") {
        clearTimers();
        phase = "quiet";
        render("idle");
      }
      return;
    }
    startBlink(status, false);
  }

  function activity(nextStatus = "working") {
    if (nextStatus !== "working") return;
    status = "working";
    if (phase === "blinking" && activityTimeout !== null) {
      renewActivityDeadline();
      return;
    }
    startBlink("working", true);
  }

  function complete() {
    if (phase === "acknowledged") return;
    clearTimers();
    status = "idle";
    phase = "completion";

    const sequence = ["working", "question", "error"];
    let index = 0;
    render(sequence[index]);
    completionTimeout = timers.setTimeout(() => {
      clearTimers();
      status = "idle";
      phase = "quiet";
      render("idle");
    }, completionDurationMs);
    completionInterval = timers.setInterval(() => {
      index += 1;
      if (index >= sequence.length) index = 0;
      render(sequence[index]);
    }, completionIntervalMs);
  }

  function stop() {
    clearTimers();
    status = "idle";
    phase = "idle";
    render("idle");
  }

  function acknowledge() {
    if (phase !== "blinking" && phase !== "completion") return;
    clearTimers();
    phase = "acknowledged";
    render("idle");
  }

  return {
    setStatus,
    activity,
    complete,
    stop,
    acknowledge,
    cancel: acknowledge,
    getStatus: () => phase === "blinking" ? status : "idle",
    getPhase: () => phase,
  };
}

module.exports = {
  TRAY_STATUS_ICONS,
  hasPendingTrayQuestion,
  resolveTrayStatus,
  shouldPulseTrayForAgentEvent,
  createTrayStatusLightController,
};
