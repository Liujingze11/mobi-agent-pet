"use strict";
(function(root) {
  const stateModel = typeof module !== "undefined" && module.exports ? require("./pet-states") : root.MobiPetStates;
  const STATE_IDS = stateModel.PET_STATE_IDS;
  const safeFile = (value) => typeof value === "string" && value.length <= 255 && !/[\\/\x00-\x1f]/.test(value) && !/^\./.test(value) && /\.(svg|gif|apng|png|webp|jpe?g)$/i.test(value);
  function groupForState(state) { return stateModel.normalizePetState(state); }
  function normalizePlan(value) {
    if (!value || value.version !== 1 || !value.states || typeof value.states !== "object") return null;
    const states = {};
    for (const id of STATE_IDS) {
      const input = value.states[id] || { mode: "sequence", actions: [] };
      if (!["random", "sequence"].includes(input.mode) || !Array.isArray(input.actions) || input.actions.length > 256) return null;
      const actions = [], seen = /* @__PURE__ */ new Set();
      for (const action of input.actions) {
        if (!action || !safeFile(action.file) || typeof action.enabled !== "boolean" || !Number.isFinite(action.durationMs) || action.durationMs < 500 || action.durationMs > 6e4 || seen.has(action.file)) return null;
        seen.add(action.file);
        actions.push({ file: action.file, enabled: action.enabled, durationMs: Math.round(action.durationMs) });
      }
      states[id] = { mode: input.mode, actions };
    }
    if (!states.idle.actions.some((a) => a.enabled)) return null;
    return { version: 1, states };
  }
  function actionDuration(theme, file) {
    const duration = theme && theme.actionDurations && theme.actionDurations[file];
    return Number.isFinite(duration) && duration > 3000 && duration <= 6e4 ? Math.ceil(duration) : 5e3;
  }
  function automaticPlan(value, theme) {
    const plan = normalizePlan(value);
    if (!plan) return null;
    for (const slot of Object.values(plan.states)) {
      for (const action of slot.actions) action.durationMs = actionDuration(theme, action.file);
    }
    return plan;
  }
  function defaultPlan(theme) {
    if (theme && theme._defaultPetActionPlan) return JSON.parse(JSON.stringify(theme._defaultPetActionPlan));
    const states = Object.fromEntries(STATE_IDS.map((id) => [id, { mode: "sequence", actions: [] }]));
    const add = (id, file) => {
      if (!safeFile(file) || states[id].actions.some((a) => a.file === file)) return;
      states[id].actions.push({ file, enabled: true, durationMs: actionDuration(theme, file) });
    };
    const normal = theme && theme.states || {};
    for (const [state, files] of Object.entries(normal)) {
      const group = groupForState(state);
      if (!group || group === "working") continue;
      for (const file of Array.isArray(files) ? files : []) add(group, file);
    }
    add("working", normal.working && normal.working[0]);
    for (const a of theme && theme.idleAnimations || []) add("idle", a.file);
    const drag = theme && theme.reactions && theme.reactions.drag;
    if (drag) for (const file of [drag.file, drag.fileLeft, drag.fileRight, ...drag.files || []]) add("held", file);
    states.idle.mode = "random";
    return { version: 1, states };
  }
  function collectActionFiles(theme) {
    if (theme && theme._sourcePetAssets) return [...theme._sourcePetAssets];
    const files = /* @__PURE__ */ new Set();
    const add = (file) => {
      if (safeFile(file)) files.add(file);
    };
    for (const values of Object.values(theme && theme.states || {})) for (const file of Array.isArray(values) ? values : []) add(file);
    for (const key of ["workingTiers", "jugglingTiers", "idleAnimations"]) for (const entry of theme && theme[key] || []) add(entry.file);
    for (const entry of Object.values(theme && theme.reactions || {})) {
      for (const file of [entry.file, entry.fileLeft, entry.fileRight, ...entry.files || []]) add(file);
    }
    for (const file of Object.values(theme && theme.displayHintMap || {})) add(file);
    return [...files];
  }
  function resolveEffectivePlan(theme) {
    const fallback = automaticPlan(defaultPlan(theme), theme);
    const saved = automaticPlan(theme && theme._userOverrides && theme._userOverrides.actionPlan, theme);
    const available = new Set(theme && theme._availablePetActionFiles || collectActionFiles(theme));
    for (const candidate of [fallback, saved]) {
      if (candidate) for (const slot of Object.values(candidate.states)) slot.actions = slot.actions.filter(a => available.has(a.file));
    }
    const plan = saved || fallback;
    if (plan && !plan.states.idle.actions.some(a => a.enabled) && fallback) plan.states.idle = fallback.states.idle;
    if (!plan || !plan.states.idle.actions.some(a => a.enabled)) throw new Error("Theme has no available enabled idle action");
    return plan;
  }
  function playbackSlot(plan, group) {
    if (!plan) return null;
    const slot = plan.states[group];
    return slot && slot.actions.some((a) => a.enabled) ? slot : plan.states.idle;
  }
  function playbackDuration(plan, group) {
    const slot = playbackSlot(plan, group);
    const actions = slot && slot.actions.filter((a) => a.enabled);
    if (!actions || !actions.length) return null;
    return slot.mode === "random" ? Math.max(...actions.map((a) => a.durationMs)) : actions.reduce((sum, a) => sum + a.durationMs, 0);
  }
  function createPlayer({ plan, render, timers = globalThis, random = Math.random }) {
    let active = null, index = -1, timer = null, held = false, latest = null, holdFallback = null, paused = false, lastDuration = 0, terminal = false;
    const value = normalizePlan(plan);
    function stopTimer() {
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
    }
    function stop() {
      stopTimer();
      active = null;
      index = -1;
      paused = false;
      terminal = false;
    }
    function pause() {
      paused = true;
      stopTimer();
    }
    function resume() {
      if (!paused) return;
      paused = false;
      if (active && !terminal) schedule(lastDuration);
    }
    function schedule(ms) {
      if (paused || terminal) return;
      timer = timers.setTimeout(() => {
        timer = null;
        play(active, held ? holdFallback : latest.fallback, held ? "held" : latest.state);
      }, ms);
    }
    function play(group, fallback, state) {
      const slot = playbackSlot(value, group);
      const actions = slot ? slot.actions.filter((a) => a.enabled) : [];
      if (!actions.length) {
        render(fallback, state);
        return;
      }
      const candidates = actions.map((_, i) => i).filter((i) => actions.length === 1 || i !== index);
      index = slot && slot.mode === "random" ? candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))] : (index + 1) % actions.length;
      const action = actions[index];
      lastDuration = action.durationMs;
      terminal = ["complete", "error"].includes(group) && (slot.mode === "random" || index === actions.length - 1);
      render(action.file, state, action.durationMs, true);
      schedule(action.durationMs);
    }
    function enter(group, fallback, state) {
      if (active === group) {
        const slot = playbackSlot(value, group);
        const actions = slot ? slot.actions.filter((a) => a.enabled) : [];
        if (actions[index]) render(actions[index].file, state);
        return;
      }
      stop();
      active = group;
      play(group, fallback, state);
    }
    function update(state, fallback) {
      latest = { state, fallback };
      if (held) return;
      const group = groupForState(state);
      if (!value || !group) {
        stop();
        return;
      }
      enter(group, fallback, state);
    }
    function hold(fallback) {
      if (held) {
        holdFallback = fallback;
        if (!value) render(fallback, "held");
        return;
      }
      held = true;
      holdFallback = fallback;
      enter("held", fallback, "held");
    }
    function release() {
      if (!held) return;
      held = false;
      stop();
      if (latest) update(latest.state, latest.fallback);
    }
    return { update, hold, release, stop, pause, resume };
  }
  const api = { STATE_IDS, safeFile, groupForState, normalizePlan, automaticPlan, resolveEffectivePlan, actionDuration, defaultPlan, collectActionFiles, playbackSlot, playbackDuration, createPlayer };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MobiPetActions = api;
})(globalThis);
