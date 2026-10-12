// src/tick.js — Main tick loop (cursor polling, eye tracking, idle/sleep detection, mini peek)
// Extracted from main.js L527-689

const { screen } = require("electron");

module.exports = function initTick(ctx) {

// ── Mouse idle tracking ──
let lastCursorX = null, lastCursorY = null;
let mouseStillSince = Date.now();
let isMouseIdle = false;       // showing idle-look
let hasTriggeredYawn = false;  // 60s threshold already fired
let idleLookPlayed = false;    // idle-look already played once since last movement
let idleLookReturnTimer = null;
let yawnDelayTimer = null;     // tracked setTimeout for yawn/idle-look transitions
let idleWasActive = false;
let lastEyeDx = 0, lastEyeDy = 0;
let lastPointerBridgeKey = null;
let lastPointerBridgePayload = null;
let mainTickTimer = null;
let mainTickActive = false;
let nextMainTickAt = 0;

// ── Spin detection: tracks cursor circling to trigger dizzy animation ──
let lastCursorAngle = null;             // last cursor angle (radians) relative to eye-tracking origin
let accumulatedSpin = 0;                // signed accumulated angular displacement
let dizzyCooldownUntil = 0;             // timestamp until which dizzy cannot re-trigger
let lastSpinTickAt = 0;                 // timestamp of last spin tick

const SPIN_THRESHOLD = Math.PI * 4;     // 2 full circles (signed) to trigger dizzy
const SPIN_IDLE_RESET_MS = 500;         // a pause longer than this resets the spin meter
const SPIN_MIN_RADIUS = 24;             // cursor must be this many px from center to count
const DIZZY_COOLDOWN_MS = 12000;        // can't re-trigger dizzy for 12s

const FAST_TICK_MS = 50;
const BOOST_TICK_MS = 100;
const IDLE_TICK_MS = 250;
// Keep a low-rate cursor probe so new movement can leave the paused state.
const REACTION_TICK_MS = 500;
const BACKGROUND_TICK_MS = 750;
const RECENT_MOUSE_MS = 2000;
const POINTER_BRIDGE_STATES = new Set(["idle"]);
const POINTER_BRIDGE_EPSILON = 0.001;

// ── Theme-driven state (refreshed on hot theme switch) ──
let theme = null;
let MOUSE_IDLE_TIMEOUT = 0;
let MOUSE_SLEEP_TIMEOUT = 0;
let SVG_IDLE_FOLLOW = null;
let IDLE_ANIMS = [];
let SLEEP_MODE = "full";
let THEME_SUPPORTS_DIZZY = false;

function refreshTheme() {
  theme = ctx.theme;
  MOUSE_IDLE_TIMEOUT = theme.timings.mouseIdleTimeout;
  MOUSE_SLEEP_TIMEOUT = theme.timings.mouseSleepTimeout;
  SVG_IDLE_FOLLOW = theme.states.idle[0];
  IDLE_ANIMS = (theme.idleAnimations || []).map(a => ({ svg: a.file, duration: a.duration }));
  SLEEP_MODE = theme.sleepSequence && theme.sleepSequence.mode === "direct" ? "direct" : "full";
  // Precompute dizzy support so the per-tick spin detector can gate cheaply and skip all
  // its math on themes that don't define a real dizzy state (e.g. Calico, Cloudling).
  THEME_SUPPORTS_DIZZY = !!(theme.states && Array.isArray(theme.states.dizzy) && theme.states.dizzy.length > 0
    && theme.timings && theme.timings.autoReturn
    && Number.isFinite(theme.timings.autoReturn.dizzy) && theme.timings.autoReturn.dizzy > 0);
}

refreshTheme();

// #509: resting idle sprite — the user-selected default idle visual when set,
// the theme's follow sprite otherwise. SVG_IDLE_FOLLOW itself stays pure so the
// eye-tracking gate below only fires on the real follow sprite.
function idleRestSvg() {
  const choice = typeof ctx.getIdleVisualChoice === "function" ? ctx.getIdleVisualChoice() : null;
  return choice || SVG_IDLE_FOLLOW;
}

// ── Unified main tick (cursor polling for eye tracking + sleep + mini peek) ──
// Input routing is handled by hitWin — no setIgnoreMouseEvents toggling here.
function startMainTick() {
  if (mainTickActive) return;
  // Render window: permanently click-through (set once, never toggle)
  ctx.win.setIgnoreMouseEvents(true);
  ctx.mouseOverPet = false;

  mainTickActive = true;
  scheduleNextTick(0);
}

function getBaseTickDelay(idleNow, miniIdleNow) {
  if (ctx.miniMode && ctx.miniPeeked) return FAST_TICK_MS;
  if (ctx.dragLocked || ctx.menuOpen || ctx.miniTransitioning) return FAST_TICK_MS;
  if (ctx.miniMode || miniIdleNow) return FAST_TICK_MS;
  if (idleNow) {
    if (Date.now() - mouseStillSince <= RECENT_MOUSE_MS) return BOOST_TICK_MS;
    return IDLE_TICK_MS;
  }
  if (ctx.idlePaused) return REACTION_TICK_MS;
  return BACKGROUND_TICK_MS;
}

function applyBoost(delay) {
  const boostUntil = Number(ctx.forceEyeResendBoostUntil) || 0;
  if (boostUntil > Date.now()) return Math.min(delay, BOOST_TICK_MS);
  return delay;
}

function getNextTickDelay(idleNow, miniIdleNow) {
  return applyBoost(getBaseTickDelay(idleNow, miniIdleNow));
}

function scheduleNextTick(delay) {
  if (!mainTickActive) return;
  if (mainTickTimer) clearTimeout(mainTickTimer);
  const safeDelay = Math.max(0, Number.isFinite(delay) ? delay : BACKGROUND_TICK_MS);
  nextMainTickAt = Date.now() + safeDelay;
  mainTickTimer = setTimeout(runMainTick, safeDelay);
}

function scheduleSoon(maxDelay = BOOST_TICK_MS) {
  if (!mainTickActive) return;
  const safeDelay = Math.max(0, Number.isFinite(maxDelay) ? maxDelay : BOOST_TICK_MS);
  if (!mainTickTimer || nextMainTickAt - Date.now() > safeDelay) {
    scheduleNextTick(safeDelay);
  }
}

function getPointerBridgeKey() {
  const state = ctx.currentState;
  if (!POINTER_BRIDGE_STATES.has(state)) return null;
  return `${state}|${ctx.currentSvg || ""}`;
}

function pointerBridgePayloadChanged(key, payload) {
  if (key !== lastPointerBridgeKey || !lastPointerBridgePayload) return true;
  return payload.inside !== lastPointerBridgePayload.inside
    || Math.abs(payload.x - lastPointerBridgePayload.x) > POINTER_BRIDGE_EPSILON
    || Math.abs(payload.y - lastPointerBridgePayload.y) > POINTER_BRIDGE_EPSILON;
}

function sendPointerBridge(cursor, bounds) {
  if (typeof ctx.getAssetPointerPayload !== "function") return;
  const key = getPointerBridgeKey();
  if (!key || !cursor || !bounds) return;
  if (ctx.currentState !== "mini-peek" && Number(ctx.eyePauseUntil) > Date.now()) return;

  const raw = ctx.getAssetPointerPayload(bounds, cursor);
  if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return;

  const payload = {
    x: raw.x,
    y: raw.y,
    // Clawd polls the global cursor, so pointer-aware Cloudling idle states
    // should keep following even when the cursor is outside the SVG art rect.
    inside: true,
  };
  if (!pointerBridgePayloadChanged(key, payload)) return;

  lastPointerBridgeKey = key;
  lastPointerBridgePayload = payload;
  ctx.sendToRenderer("cloudling-pointer", payload);
}

function runMainTick() {
  mainTickTimer = null;
  nextMainTickAt = 0;
  const delay = runMainTickOnce();
  if (mainTickActive && !mainTickTimer) scheduleNextTick(delay);
}

function runMainTickOnce() {
    if (!ctx.win || ctx.win.isDestroyed()) return BACKGROUND_TICK_MS;

    // ── Idle state edge detection (must run every tick for timer cleanup) ──
    const idleNow = ctx.currentState === "idle" && !ctx.idlePaused;
    const miniIdleNow = ctx.miniMode && ctx.currentState === "idle" && !ctx.idlePaused && !ctx.miniTransitioning;
    // #569: an active roam walk runs in state "roam", so it must keep polling
    // the cursor as well — otherwise the "cancel roaming when mouse moves"
    // block below is unreachable mid-walk, and a user interaction that resizes
    // the pet (e.g. the Settings size slider) lands mid-walk only to be
    // overwritten by the walk's anchored per-frame bounds writes.
    const roamNow = ctx.currentState === "roam" && !ctx.idlePaused;
    const nextDelay = () => getNextTickDelay(idleNow, miniIdleNow);

    if (idleNow && !idleWasActive) {
      isMouseIdle = false;
      hasTriggeredYawn = false;
      idleLookPlayed = false;
      lastCursorX = null;
      lastCursorY = null;
      mouseStillSince = Date.now();
      lastEyeDx = 0;
      lastEyeDy = 0;
      lastCursorAngle = null;
      accumulatedSpin = 0;
      lastSpinTickAt = 0;
      if (idleLookReturnTimer) { clearTimeout(idleLookReturnTimer); idleLookReturnTimer = null; }
      if (yawnDelayTimer) { clearTimeout(yawnDelayTimer); yawnDelayTimer = null; }
    }

    if (!idleNow && idleWasActive) {
      if (idleLookReturnTimer) { clearTimeout(idleLookReturnTimer); idleLookReturnTimer = null; }
      if (yawnDelayTimer) { clearTimeout(yawnDelayTimer); yawnDelayTimer = null; }
    }
    idleWasActive = idleNow;

    // Skip expensive native IPC calls (getCursorScreenPoint, getBounds) when
    // cursor tracking is not needed — saves ~20 calls/sec to the OS layer.
    const needsCursorPoll = idleNow || miniIdleNow || ctx.miniMode || roamNow;
    if (!needsCursorPoll) return nextDelay();

    const cursor = screen.getCursorScreenPoint();
    const moved = lastCursorX !== null && (cursor.x !== lastCursorX || cursor.y !== lastCursorY);
    lastCursorX = cursor.x;
    lastCursorY = cursor.y;

    // ── Cursor-over-pet tracking (for mini peek + eye tracking, NOT for input routing) ──
    const pointerBridgeKey = getPointerBridgeKey();
    const needsPointerBridgeBounds = !!pointerBridgeKey
      && (moved || ctx.forceEyeResend || pointerBridgeKey !== lastPointerBridgeKey);
    const needsBounds = ctx.miniMode || moved || ctx.forceEyeResend || miniIdleNow || needsPointerBridgeBounds;
    let bounds = null;
    if (needsBounds) {
      bounds = typeof ctx.getPetWindowBounds === "function"
        ? ctx.getPetWindowBounds()
        : ctx.win.getBounds();
    }
    if (bounds && !ctx.dragLocked) {
      const hit = ctx.getHitRectScreen(bounds);
      const over = cursor.x >= hit.left && cursor.x <= hit.right
                && cursor.y >= hit.top  && cursor.y <= hit.bottom;
      ctx.mouseOverPet = over;
    }

    // ── Mini mode peek hover ──
    if (ctx.miniMode && !ctx.miniTransitioning && !ctx.dragLocked && !ctx.menuOpen) {
      const canPeek = ctx.currentState === "idle";
      if (!ctx.isAnimating && canPeek) {
        if (ctx.mouseOverPet && !ctx.miniPeeked) { ctx.miniPeekIn(); ctx.miniPeeked = true; }
        else if (!ctx.mouseOverPet && ctx.miniPeeked) { ctx.miniPeekOut(); ctx.miniPeeked = false; }
      }
    }


    sendPointerBridge(cursor, bounds);

    if (!idleNow && !miniIdleNow && !roamNow) return nextDelay();

    // ── Free roam: cancel roaming when mouse moves ──
    if (ctx.roam) {
      if (moved && ctx.roam.enabled) {
        ctx.roam.cancelRoam();
      }
    }

    // ── Below: idle or mini-idle logic ──
    // Normal idle: mouse idle detection + sleep sequence
    if (idleNow) {
      if (moved) {
        mouseStillSince = Date.now();
        hasTriggeredYawn = false;
        idleLookPlayed = false;
        if (idleLookReturnTimer) { clearTimeout(idleLookReturnTimer); idleLookReturnTimer = null; }
        if (yawnDelayTimer) { clearTimeout(yawnDelayTimer); yawnDelayTimer = null; }
        if (isMouseIdle) {
          isMouseIdle = false;
          ctx.sendToRenderer("state-change", "idle", idleRestSvg());
        }
      }

      const elapsed = Date.now() - mouseStillSince;

      // Startup recovery: Claude Code is running but no hook yet — stay awake
      // Only suppress sleep sequence, don't skip eye tracking below
      if (ctx.startupRecoveryActive) {
        mouseStillSince = Date.now();
      }

      // Idle actions and their order are owned by the effective action plan.
      // Free roam tick: wander around when idle long enough
      if (ctx.roam) ctx.roam.tick();
    }

    const trackEyesNow = (idleNow && ctx.currentSvg === SVG_IDLE_FOLLOW && !isMouseIdle) || miniIdleNow;
    if (!trackEyesNow) {
      // Resting on a non-follow visual: the eye path below never runs, so
      // consume the resend flag here — otherwise needsBounds stays true and
      // getPetWindowBounds() fires every idle tick for nothing.
      if (idleNow && !isMouseIdle && ctx.forceEyeResend) ctx.forceEyeResend = false;
      return nextDelay();
    }
    if (ctx.eyePauseUntil) {
      if (Date.now() < ctx.eyePauseUntil) return nextDelay();
      ctx.eyePauseUntil = null;
    }
    if (!moved && !ctx.forceEyeResend) return nextDelay();

    // ── Eye position calculation (shared by idle and mini-idle) ──
    const skipDedup = ctx.forceEyeResend;
    ctx.forceEyeResend = false;

    if (!bounds) {
      bounds = typeof ctx.getPetWindowBounds === "function"
        ? ctx.getPetWindowBounds()
        : ctx.win.getBounds();
    }

    const obj = ctx.getObjRect(bounds);
    const eyeScreenX = obj.x + obj.w * theme.eyeTracking.eyeRatioX;
    const eyeScreenY = obj.y + obj.h * theme.eyeTracking.eyeRatioY;

    const relX = cursor.x - eyeScreenX;
    const relY = cursor.y - eyeScreenY;

    const MAX_OFFSET = theme.eyeTracking.maxOffset;
    const dist = Math.sqrt(relX * relX + relY * relY);
    let eyeDx = 0, eyeDy = 0;
    if (dist > 1) {
      const scale = Math.min(1, dist / 300);
      eyeDx = (relX / dist) * MAX_OFFSET * scale;
      eyeDy = (relY / dist) * MAX_OFFSET * scale;
    }

    eyeDx = Math.round(eyeDx * 2) / 2;
    eyeDy = Math.round(eyeDy * 2) / 2;
    const yClamp = MAX_OFFSET * 0.5;
    const xClamp = MAX_OFFSET * 0.85;
    eyeDx = Math.max(-xClamp, Math.min(xClamp, eyeDx));
    eyeDy = Math.max(-yClamp, Math.min(yClamp, eyeDy));

    if (skipDedup || eyeDx !== lastEyeDx || eyeDy !== lastEyeDy) {
      lastEyeDx = eyeDx;
      lastEyeDy = eyeDy;
      ctx.sendToRenderer("eye-move", eyeDx, eyeDy);
    }

    return nextDelay();
}

function resetIdleTimer() {
  mouseStillSince = Date.now();
}

function cleanup() {
  mainTickActive = false;
  if (mainTickTimer) { clearTimeout(mainTickTimer); mainTickTimer = null; }
  nextMainTickAt = 0;
  if (idleLookReturnTimer) { clearTimeout(idleLookReturnTimer); idleLookReturnTimer = null; }
  if (yawnDelayTimer) { clearTimeout(yawnDelayTimer); yawnDelayTimer = null; }
  lastCursorX = null;
  lastCursorY = null;
  isMouseIdle = false;
  hasTriggeredYawn = false;
  idleLookPlayed = false;
  idleWasActive = false;
  lastEyeDx = 0;
  lastEyeDy = 0;
  lastPointerBridgeKey = null;
  lastPointerBridgePayload = null;
  lastCursorAngle = null;
  accumulatedSpin = 0;
  dizzyCooldownUntil = 0;
  lastSpinTickAt = 0;
}

// Expose mouseStillSince for wake poll (state.js deep sleep timeout)
Object.defineProperty(startMainTick, '_mouseStillSince', {
  get() { return mouseStillSince; },
});

return { startMainTick, resetIdleTimer, cleanup, refreshTheme, scheduleSoon, get _mouseStillSince() { return mouseStillSince; } };

};
