"use strict";

const { BrowserWindow, screen } = require("electron");
const path = require("path");
const { keepOutOfTaskbar } = require("./taskbar");
const { clampTextScale, scaleHeight, applyZoomToWindow } = require("./text-scale");
const ringGeom = require("./quota-ring-geometry");
const createMouseButtonReader = require("./mouse-button-reader");

const isLinux = process.platform === "linux";
const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";

const HUD_BORDER_Y = 2;
const HUD_WIDTH = 240;
const HUD_WIDTH_COMPACT = 190;
const HUD_WIDTH_LABELS = 320;
const HUD_WIDTH_LABELS_COMPACT = 260;
const HUD_CONTEXT_USAGE_WIDTH_BUMP = 36;
const HUD_LABELS_ONLY_WIDTH_TRIM = 36;
const HUD_ROW_HEIGHT = 28;
const HUD_MAX_EXPANDED_ROWS = 3;
const HUD_MAX_EXPANDED_ROWS_LABELS = 5;
const HUD_HEIGHT = HUD_ROW_HEIGHT + HUD_BORDER_Y;
const HUD_WINDOW_SHELL = Object.freeze({
  top: 2,
  right: 3,
  bottom: 8,
  left: 3,
});
const HUD_PET_GAP = 4;
const BUBBLE_GAP = 6;
const EDGE_MARGIN = 8;
const WIN_TOPMOST_LEVEL = "pop-up-menu";
const LINUX_WINDOW_TYPE = "toolbar";
const MAC_FLOATING_TOPMOST_DELAY_MS = 120;
const HOT_ZONE_PAD = 24;
const ELIGIBILITY_POLL_MS = 200;
const OUTSIDE_CLICK_POLL_MS = 16;
const REVEAL_AUTO_DISMISS_MS = 5000;
const HUD_WIDTH_GROWTH_RATIO = 0.4;

function clampToWorkArea(value, min, max) {
  if (max < min) return min;
  return Math.max(min, Math.min(value, max));
}

function isScreenRect(rect) {
  return !!rect
    && Number.isFinite(rect.left)
    && Number.isFinite(rect.top)
    && Number.isFinite(rect.right)
    && Number.isFinite(rect.bottom);
}

function isHudSession(session) {
  return !!session && !session.headless && session.state !== "sleeping" && !session.hiddenFromHud;
}

function snapshotHasVisibleSessions(snapshot) {
  const sessions = Array.isArray(snapshot && snapshot.sessions) ? snapshot.sessions : [];
  return sessions.some(isHudSession);
}

function evaluateBaseEligible({
  snapshot,
  sessionHudEnabled,
  petHidden,
  miniMode,
  miniTransitioning,
  showQuota,
}) {
  if (!snapshot) return false;
  if (petHidden) return false;
  if (miniMode || miniTransitioning) return false;
  // The Session HUD (session cards) and the quota ring are INDEPENDENT: the
  // HUD is gated by its own master switch, the ring by the quota switch. Either
  // one being eligible reveals the floating UI on a pet click — so the ring can
  // still be checked ("a remote's quota before starting work") even with the
  // Session HUD turned off.
  const hudEligible = sessionHudEnabled !== false && snapshotHasVisibleSessions(snapshot);
  const ringEligible = countQuotaCoins(snapshot, showQuota) > 0;
  return hudEligible || ringEligible;
}

function pointInExpandedRect(point, rect, pad) {
  if (!point || !isScreenRect(rect)) return false;
  const p = Number.isFinite(pad) ? pad : 0;
  return point.x >= rect.left - p
    && point.x <= rect.right + p
    && point.y >= rect.top - p
    && point.y <= rect.bottom + p;
}

function computeAutoHideHotZone({ petHitRect, expectedHudContentBounds, expectedRingContentBounds, pad }) {
  const rects = [];
  if (isScreenRect(petHitRect)) rects.push(petHitRect);
  // Both the HUD (below the pet) and the quota ring (beside the pet) are part
  // of the hot zone: the cursor moving from the pet onto either one must keep
  // the whole floating UI alive.
  for (const r of [expectedHudContentBounds, expectedRingContentBounds]) {
    if (!r) continue;
    if (Number.isFinite(r.x) && Number.isFinite(r.y)
        && Number.isFinite(r.width) && Number.isFinite(r.height)
        && r.width > 0 && r.height > 0) {
      rects.push({ left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height });
    } else if (isScreenRect(r)) {
      rects.push(r);
    }
  }
  return { rects, pad: Number.isFinite(pad) ? pad : 0 };
}

function pointInHotZone(point, hotZone) {
  if (!hotZone || !Array.isArray(hotZone.rects)) return false;
  for (const rect of hotZone.rects) {
    if (pointInExpandedRect(point, rect, hotZone.pad)) return true;
  }
  return false;
}

function evaluateShouldShow({
  snapshot,
  sessionHudEnabled,
  sessionHudPinned,
  clickRevealed,
  petHidden,
  miniMode,
  miniTransitioning,
  showQuota,
}) {
  const baseEligible = evaluateBaseEligible({
    snapshot,
    sessionHudEnabled,
    petHidden,
    miniMode,
    miniTransitioning,
    showQuota,
  });
  if (!baseEligible) return { show: false, nextHoldUntil: 0 };
  if (sessionHudPinned === true) return { show: true, nextHoldUntil: 0 };
  if (clickRevealed !== true) return { show: false, nextHoldUntil: 0 };

  // A revealed card stays open until an explicit dismissal or eligibility loss.
  return { show: true, nextHoldUntil: 0 };
}

function getHudMaxExpandedRows(showStateLabels = true) {
  return showStateLabels === false ? HUD_MAX_EXPANDED_ROWS : HUD_MAX_EXPANDED_ROWS_LABELS;
}

function computeHudLayout(snapshot, options = {}) {
  const sessions = (snapshot && Array.isArray(snapshot.sessions)) ? snapshot.sessions : [];
  if (sessions.length === 0) return { expanded: [], folded: [], rowCount: 0 };
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const orderedIds = (snapshot && Array.isArray(snapshot.orderedIds))
    ? snapshot.orderedIds
    : sessions.map((s) => s.id);
  const ordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  const orderedSet = new Set(ordered.map((s) => s.id));
  const missing = sessions.filter((s) => !orderedSet.has(s.id));
  const visible = ordered.concat(missing).filter(isHudSession);
  const maxExpandedRows = getHudMaxExpandedRows(options.showStateLabels);
  const expanded = visible.slice(0, maxExpandedRows);
  const folded = visible.slice(maxExpandedRows);
  const rowCount = expanded.length + (folded.length > 0 ? 1 : 0);
  return { expanded, folded, rowCount };
}

// One coin per (source, provider) with drawable quota. The pet-attached quota
// ring lives in its OWN window (quota-ring.html), sized and placed by
// quota-ring-geometry; the HUD no longer carries a quota strip. Here we only
// need the count — quota alone can keep the pet's floating UI up (the "check a
// remote's quota before starting work" moment), and the ring window is sized
// from it.
function countQuotaCoins(snapshot, showQuota) {
  return ringGeom.countQuotaCoins(snapshot, showQuota);
}

function computeHudHeight(rowCount) {
  if (!Number.isFinite(rowCount) || rowCount <= 0) return HUD_ROW_HEIGHT;
  return rowCount * HUD_ROW_HEIGHT + HUD_BORDER_Y;
}

function computeHudReservedOffset(cardHeight) {
  const h = Number.isFinite(cardHeight) && cardHeight > 0 ? cardHeight : HUD_ROW_HEIGHT;
  return HUD_PET_GAP + h + HUD_WINDOW_SHELL.bottom + BUBBLE_GAP;
}

function getHudWidthScale(scale) {
  const s = clampTextScale(scale);
  if (s <= 1) return s;
  return 1 + (s - 1) * HUD_WIDTH_GROWTH_RATIO;
}

function computeHudOuterWidth(width, scale, widthScale = scale) {
  const s = clampTextScale(scale);
  const ws = clampTextScale(widthScale);
  return Math.round(width * ws)
    + Math.round(HUD_WINDOW_SHELL.left * s)
    + Math.round(HUD_WINDOW_SHELL.right * s);
}

function computeSessionHudBounds({ hitRect, anchorRect, workArea, width = HUD_WIDTH, height = HUD_HEIGHT, scale = 1, widthScale = scale }) {
  const followRect = isScreenRect(anchorRect) ? anchorRect : hitRect;
  if (!isScreenRect(followRect) || !workArea) return null;
  const followTop = Math.round(followRect.top);
  const followBottom = Math.round(followRect.bottom);
  const followCx = Math.round((followRect.left + followRect.right) / 2);

  // width/height arrive in CSS px (HUD constants); rects are DIP. Convert
  // everything page-rendered before mixing coordinate spaces. Height, shell and
  // gaps keep full textScale, while width can grow more gently so a large-text
  // HUD stays compact instead of turning into a banner.
  const s = clampTextScale(scale);
  const ws = clampTextScale(widthScale);
  const dipWidth = Math.round(width * ws);
  const dipHeight = Math.ceil(height * s);
  const shell = {
    top: Math.round(HUD_WINDOW_SHELL.top * s),
    right: Math.round(HUD_WINDOW_SHELL.right * s),
    bottom: Math.round(HUD_WINDOW_SHELL.bottom * s),
    left: Math.round(HUD_WINDOW_SHELL.left * s),
  };
  const petGap = Math.round(HUD_PET_GAP * s);
  const edgeMargin = Math.round(EDGE_MARGIN * s);

  const outerWidth = dipWidth + shell.left + shell.right;
  const outerHeight = dipHeight + shell.top + shell.bottom;
  const minX = Math.round(workArea.x);
  const maxX = Math.round(workArea.x + workArea.width - dipWidth);
  const x = clampToWorkArea(followCx - Math.round(dipWidth / 2), minX, maxX);

  const belowY = followBottom + petGap;
  const belowMax = workArea.y + workArea.height - edgeMargin;
  if (belowY + dipHeight <= belowMax) {
    const contentBounds = { x, y: belowY, width: dipWidth, height: dipHeight };
    return {
      bounds: {
        x: contentBounds.x - shell.left,
        y: contentBounds.y - shell.top,
        width: outerWidth,
        height: outerHeight,
      },
      contentBounds,
      flippedAbove: false,
    };
  }

  const minY = Math.round(workArea.y + edgeMargin);
  const maxY = Math.round(workArea.y + workArea.height - edgeMargin - dipHeight);
  const aboveY = followTop - dipHeight - petGap;
  const contentBounds = {
    x,
    y: clampToWorkArea(aboveY, minY, maxY),
    width: dipWidth,
    height: dipHeight,
  };
  return {
    bounds: {
      x: contentBounds.x - shell.left,
      y: contentBounds.y - shell.top,
      width: outerWidth,
      height: outerHeight,
    },
    contentBounds,
    flippedAbove: true,
  };
}

function getHudWidth(showStateLabels = true, showContextUsage = false) {
  const base = showStateLabels === false
    ? HUD_WIDTH_COMPACT
    : HUD_WIDTH_LABELS_COMPACT;
  if (showStateLabels !== false && showContextUsage !== true) {
    return Math.max(HUD_WIDTH_COMPACT, base - HUD_LABELS_ONLY_WIDTH_TRIM);
  }
  return showContextUsage === true ? base + HUD_CONTEXT_USAGE_WIDTH_BUMP : base;
}

function deferMacFloatingVisibility(ctx, win) {
  if (!isMac || !win || win.isDestroyed()) return;
  const deferUntil = Date.now() + MAC_FLOATING_TOPMOST_DELAY_MS;
  win.__clawdMacDeferredVisibilityUntil = deferUntil;
  setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    if (win.__clawdMacDeferredVisibilityUntil === deferUntil) {
      delete win.__clawdMacDeferredVisibilityUntil;
    }
    if (typeof ctx.reapplyMacVisibility === "function") ctx.reapplyMacVisibility();
  }, MAC_FLOATING_TOPMOST_DELAY_MS);
}

module.exports = function initSessionHud(ctx) {
  let hudWindow = null;
  let didFinishLoad = false;
  let latestSnapshot = null;
  let hudFlippedAbove = false;
  let lastReservedOffset = 0;
  // Pet-attached quota ring — a sibling floating window (quota-ring.html) that
  // shares this module's reveal / pin / explicit-dismiss lifecycle. The HUD now
  // shows sessions only; the ring shows account quota beside the pet.
  let ringWindow = null;
  let ringDidFinishLoad = false;
  let ringSide = "left";

  function getTextScale() {
    return clampTextScale(typeof ctx.getTextScale === "function" ? ctx.getTextScale() : 1);
  }
  let lastHudHeight = HUD_ROW_HEIGHT;
  let pollTimer = null;
  let clickRevealed = false;
  let autoDismissTimer = null;
  const mouseButtonReader = ctx.mouseButtonReader || createMouseButtonReader();
  let outsideClickTimer = null;
  let lastMouseButtons = null;

  function cancelAutoDismiss() {
    if (autoDismissTimer !== null) clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  }

  function scheduleAutoDismiss({ restart = false } = {}) {
    if (!isRevealPollingNeeded()) return;
    if (autoDismissTimer !== null && !restart) return;
    const visible = [hudWindow, ringWindow].some(win =>
      win && !win.isDestroyed() && win.isVisible());
    if (!visible) return;
    cancelAutoDismiss();
    const timer = setTimeout(() => {
      if (autoDismissTimer !== timer) return;
      autoDismissTimer = null;
      dismissFromInteraction();
    }, REVEAL_AUTO_DISMISS_MS);
    autoDismissTimer = timer;
    timer?.unref?.();
  }

  function stopOutsideClickPoll() {
    if (outsideClickTimer !== null) clearTimeout(outsideClickTimer);
    outsideClickTimer = null;
    lastMouseButtons = null;
    mouseButtonReader.stop();
  }

  function dismissFromInteraction() {
    // A fixed card keeps its existing always-visible contract.
    if (ctx.sessionHudPinned === true || !clickRevealed) return;
    clearReveal();
    syncSessionHud(latestSnapshot, { sendSnapshot: false });
  }

  function isPointOnPetOrCard(point) {
    const bounds = typeof ctx.getPetWindowBounds === "function" ? ctx.getPetWindowBounds() : null;
    const hit = bounds && typeof ctx.getHitRectScreen === "function" ? ctx.getHitRectScreen(bounds) : null;
    if (pointInExpandedRect(point, hit, 0)) return true;
    for (const win of [hudWindow, ringWindow]) {
      if (!win || win.isDestroyed() || !win.isVisible()) continue;
      const rect = win.getBounds();
      if (pointInExpandedRect(point, {
        left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height,
      }, 0)) return true;
    }
    return false;
  }

  function pollOutsideClick() {
    outsideClickTimer = null;
    if (!isRevealPollingNeeded()) { stopOutsideClickPoll(); return; }
    const buttons = mouseButtonReader.read();
    if (!Number.isInteger(buttons)) { stopOutsideClickPoll(); return; }
    const pressed = lastMouseButtons !== null && (buttons & ~lastMouseButtons) !== 0;
    lastMouseButtons = buttons;
    if (pressed) {
      let point = null;
      try { point = screen.getCursorScreenPoint(); } catch {}
      if (point && !isPointOnPetOrCard(point)) dismissFromInteraction();
    }
    if (isRevealPollingNeeded()) {
      outsideClickTimer = setTimeout(pollOutsideClick, OUTSIDE_CLICK_POLL_MS);
      outsideClickTimer?.unref?.();
    }
  }

  function startOutsideClickPoll() {
    if (outsideClickTimer !== null) return;
    lastMouseButtons = mouseButtonReader.read();
    if (!Number.isInteger(lastMouseButtons)) return;
    outsideClickTimer = setTimeout(pollOutsideClick, OUTSIDE_CLICK_POLL_MS);
    outsideClickTimer?.unref?.();
  }

  function getCurrentSnapshot() {
    return typeof ctx.getSessionSnapshot === "function"
      ? ctx.getSessionSnapshot()
      : { sessions: [], groups: [], orderedIds: [], menuOrderedIds: [] };
  }

  function getMiniMode() {
    return typeof ctx.getMiniMode === "function" && ctx.getMiniMode();
  }

  function getMiniTransitioning() {
    return typeof ctx.getMiniTransitioning === "function" && ctx.getMiniTransitioning();
  }

  function baseEligible(snapshot = latestSnapshot) {
    return evaluateBaseEligible({
      snapshot,
      sessionHudEnabled: ctx.sessionHudEnabled,
      petHidden: ctx.petHidden,
      miniMode: getMiniMode(),
      miniTransitioning: getMiniTransitioning(),
      showQuota: ctx.sessionHudShowQuota !== false,
    });
  }

  function shouldShow(snapshot = latestSnapshot) {
    if (!baseEligible(snapshot)) return false;
    if (ctx.sessionHudPinned === true) return true;
    return clickRevealed;
  }

  function isRevealPollingNeeded() {
    if (!baseEligible(latestSnapshot)) return false;
    if (ctx.sessionHudPinned === true) return false;
    return clickRevealed === true;
  }

  function collectRingAvoidRects(hudContentBounds) {
    const rects = [];
    if (hudContentBounds) rects.push(hudContentBounds);

    if (typeof ctx.getPermissionBubbleBounds === "function") {
      try {
        const permissionBounds = ctx.getPermissionBubbleBounds();
        if (Array.isArray(permissionBounds)) rects.push(...permissionBounds);
      } catch {}
    }

    return rects;
  }

  function pollRevealEligibility() {
    pollTimer = null;
    if (!isRevealPollingNeeded()) {
      stopRevealPolling();
      syncSessionHud(latestSnapshot, { sendSnapshot: false });
      return;
    }
    if (isRevealPollingNeeded()) scheduleEligibilityTick();
  }

  function scheduleEligibilityTick() {
    if (pollTimer) return;
    pollTimer = setTimeout(pollRevealEligibility, ELIGIBILITY_POLL_MS);
  }

  function startRevealPolling() {
    if (!isRevealPollingNeeded()) return;
    if (!pollTimer) scheduleEligibilityTick();
    startOutsideClickPoll();
  }

  function stopRevealPolling() {
    cancelAutoDismiss();
    stopOutsideClickPoll();
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    clickRevealed = false;
  }

  // Internal: clear revealed state without syncing. Caller decides next sync.
  function clearReveal() {
    cancelAutoDismiss();
    stopOutsideClickPoll();
    clickRevealed = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  // Public API: user clicked the pet to reveal HUD.
  function revealFromPet() {
    // Quota can expire while both overlay windows are hidden and no session
    // event arrives. Re-read before deciding eligibility so a stale cached
    // snapshot cannot resurrect a dead Orbit coin.
    latestSnapshot = getCurrentSnapshot();
    if (!baseEligible(latestSnapshot)) return;
    if (ctx.sessionHudPinned === true) return;     // pinned already always-show
    if (clickRevealed) {
      // Another double-click grants a fresh reading interval.
      scheduleAutoDismiss({ restart: true });
      return;
    }
    clickRevealed = true;
    syncSessionHud(latestSnapshot, { sendSnapshot: true });
    startRevealPolling();
  }

  // Public API: settings effect router calls this when sessionHudPinned flips.
  // Router has already updated ctx.sessionHudPinned before calling.
  function handlePinnedChanged(next) {
    if (next === true) {
      stopRevealPolling();
      // Pinned now — HUD always shows via shouldShow. Clear any stale reveal.
      clickRevealed = false;
      syncSessionHud(latestSnapshot);
      return;
    }
    // unpin transition — read real window state, NOT shouldShow() (router
    // already mirrored sessionHudPinned=false so shouldShow would return
    // false and cause the HUD to flash hidden).
    const wasVisible =
      (hudWindow && !hudWindow.isDestroyed() && hudWindow.isVisible())
      || (ringWindow && !ringWindow.isDestroyed() && ringWindow.isVisible());
    if (wasVisible && baseEligible(latestSnapshot)) {
      // Unpinning starts a fresh reading interval when the card is shown.
      clickRevealed = true;
      startRevealPolling();
      syncSessionHud(latestSnapshot);
    } else {
      syncSessionHud(latestSnapshot);
    }
  }

  function syncAutoHidePollLifecycle() {
    if (isRevealPollingNeeded()) startRevealPolling();
    else stopRevealPolling();
  }

  function sendSnapshot(snapshot = latestSnapshot) {
    if (!snapshot || !hudWindow || hudWindow.isDestroyed() || !didFinishLoad) return;
    if (!hudWindow.webContents || hudWindow.webContents.isDestroyed()) return;
    hudWindow.webContents.send("session-hud:session-snapshot", {
      ...snapshot,
      hudShowStateLabels: ctx.sessionHudShowStateLabels !== false,
      hudShowContextUsage: ctx.sessionHudShowContextUsage !== false,
      hudShowQuota: ctx.sessionHudShowQuota !== false,
      hudPinned: ctx.sessionHudPinned === true,
    });
  }

  function sendI18n() {
    if (typeof ctx.getI18n !== "function") return;
    const payload = ctx.getI18n();
    if (hudWindow && !hudWindow.isDestroyed() && didFinishLoad
        && hudWindow.webContents && !hudWindow.webContents.isDestroyed()) {
      hudWindow.webContents.send("session-hud:lang-change", payload);
    }
    if (ringWindow && !ringWindow.isDestroyed() && ringDidFinishLoad
        && ringWindow.webContents && !ringWindow.webContents.isDestroyed()) {
      ringWindow.webContents.send("quota-ring:lang-change", payload);
    }
  }

  function sendRingSnapshot(snapshot = latestSnapshot, side = ringSide) {
    if (!snapshot || !ringWindow || ringWindow.isDestroyed() || !ringDidFinishLoad) return;
    if (!ringWindow.webContents || ringWindow.webContents.isDestroyed()) return;
    ringWindow.webContents.send("quota-ring:snapshot", {
      accountQuota: Array.isArray(snapshot.accountQuota) ? snapshot.accountQuota : [],
      quotaAgentIcons: snapshot.quotaAgentIcons || {},
      side,
    });
  }

  // The quota ring window mirrors the HUD window's chrome (transparent,
  // non-focusable, always-on-top panel) — only the preload/page and the
  // snapshot channel differ.
  function ensureQuotaRing() {
    if (ringWindow && !ringWindow.isDestroyed()) return ringWindow;
    if (!ctx.win || ctx.win.isDestroyed()) return null;

    ringDidFinishLoad = false;
    const scale = getTextScale();
    const provisional = ringGeom.constants;
    ringWindow = new BrowserWindow({
      parent: ctx.win,
      width: scaleHeight(provisional.COIN_SIZE + provisional.READOUT_W + 40, scale),
      height: scaleHeight(provisional.COIN_SIZE * 2 + 40, scale),
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: !isMac,
      focusable: false,
      hasShadow: false,
      backgroundColor: "#00000000",
      ...(isLinux ? { type: LINUX_WINDOW_TYPE } : {}),
      ...(isMac ? { type: "panel" } : {}),
      webPreferences: {
        preload: path.join(__dirname, "preload-quota-ring.js"),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    if (isWin) ringWindow.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    if (typeof ctx.guardAlwaysOnTop === "function") ctx.guardAlwaysOnTop(ringWindow);

    ringWindow.loadFile(path.join(__dirname, "quota-ring.html"));
    ringWindow.webContents.once("did-finish-load", () => {
      ringDidFinishLoad = true;
      applyZoomToWindow(ringWindow, getTextScale());
      sendI18n();
      syncSessionHud();
    });
    ringWindow.on("closed", () => {
      ringWindow = null;
      ringDidFinishLoad = false;
    });

    return ringWindow;
  }

  function hideQuotaRing() {
    if (ringWindow && !ringWindow.isDestroyed()) ringWindow.hide();
  }

  function showQuotaRing(win) {
    if (!win || win.isDestroyed() || !ringDidFinishLoad) return;
    if (!win.isVisible()) {
      win.showInactive();
      keepOutOfTaskbar(win);
      if (isMac) deferMacFloatingVisibility(ctx, win);
      else if (typeof ctx.reapplyMacVisibility === "function") ctx.reapplyMacVisibility();
    }
    scheduleAutoDismiss();
  }

  function computeRingBounds(snapshot, scale = getTextScale(), avoidRects = []) {
    if (!ctx.win || ctx.win.isDestroyed()) return null;
    const coinCount = countQuotaCoins(snapshot, ctx.sessionHudShowQuota !== false);
    if (coinCount <= 0) return null;
    const petBounds = typeof ctx.getPetWindowBounds === "function" ? ctx.getPetWindowBounds() : null;
    if (!petBounds) return null;
    const hitRect = typeof ctx.getHitRectScreen === "function" ? ctx.getHitRectScreen(petBounds) : null;
    const anchorRect = typeof ctx.getSessionHudAnchorRect === "function" ? ctx.getSessionHudAnchorRect(petBounds) : null;
    const cx = petBounds.x + petBounds.width / 2;
    const cy = petBounds.y + petBounds.height / 2;
    const workArea = typeof ctx.getNearestWorkArea === "function"
      ? ctx.getNearestWorkArea(cx, cy)
      : { x: 0, y: 0, width: 1280, height: 800 };
    return ringGeom.computeQuotaRingBounds({
      hitRect,
      anchorRect,
      workArea,
      coinCount,
      scale,
      avoidRects,
    });
  }

  function ensureSessionHud() {
    if (hudWindow && !hudWindow.isDestroyed()) return hudWindow;
    if (!ctx.win || ctx.win.isDestroyed()) return null;

    didFinishLoad = false;
    hudFlippedAbove = false;
    const hudWidth = getHudWidth(
      ctx.sessionHudShowStateLabels !== false,
      ctx.sessionHudShowContextUsage !== false
    );
    // Provisional CSS px → DIP size; syncSessionHud() replaces it with the
    // precise computeSessionHudBounds() result before the window is shown.
    const scale = getTextScale();
    const widthScale = getHudWidthScale(scale);
    hudWindow = new BrowserWindow({
      parent: ctx.win,
      width: computeHudOuterWidth(hudWidth, scale, widthScale),
      height: scaleHeight(HUD_HEIGHT + HUD_WINDOW_SHELL.top + HUD_WINDOW_SHELL.bottom, scale),
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: !isMac,
      focusable: false,
      hasShadow: false,
      backgroundColor: "#00000000",
      ...(isLinux ? { type: LINUX_WINDOW_TYPE } : {}),
      ...(isMac ? { type: "panel" } : {}),
      webPreferences: {
        preload: path.join(__dirname, "preload-session-hud.js"),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    if (isWin) hudWindow.setAlwaysOnTop(true, WIN_TOPMOST_LEVEL);
    if (typeof ctx.guardAlwaysOnTop === "function") ctx.guardAlwaysOnTop(hudWindow);

    hudWindow.loadFile(path.join(__dirname, "session-hud.html"));
    hudWindow.webContents.once("did-finish-load", () => {
      didFinishLoad = true;
      // Explicit even though same-origin propagation usually covers it — a
      // stale partition-persisted factor must never win over prefs.
      applyZoomToWindow(hudWindow, getTextScale());
      sendI18n();
      syncSessionHud();
    });
    hudWindow.on("closed", () => {
      hudWindow = null;
      didFinishLoad = false;
      hudFlippedAbove = false;
      notifyReservedOffsetIfChanged();
    });

    return hudWindow;
  }

  function hideSessionHud() {
    hudFlippedAbove = false;
    if (hudWindow && !hudWindow.isDestroyed()) hudWindow.hide();
    notifyReservedOffsetIfChanged();
  }

  function computeBounds(snapshot, scale = getTextScale()) {
    if (!ctx.win || ctx.win.isDestroyed()) return null;
    const petBounds = typeof ctx.getPetWindowBounds === "function" ? ctx.getPetWindowBounds() : null;
    if (!petBounds) return null;
    const hitRect = typeof ctx.getHitRectScreen === "function"
      ? ctx.getHitRectScreen(petBounds)
      : null;
    const anchorRect = typeof ctx.getSessionHudAnchorRect === "function"
      ? ctx.getSessionHudAnchorRect(petBounds)
      : null;
    const cx = petBounds.x + petBounds.width / 2;
    const cy = petBounds.y + petBounds.height / 2;
    const workArea = typeof ctx.getNearestWorkArea === "function"
      ? ctx.getNearestWorkArea(cx, cy)
      : { x: 0, y: 0, width: 1280, height: 800 };
    const layout = computeHudLayout(snapshot, { showStateLabels: ctx.sessionHudShowStateLabels !== false });
    const height = computeHudHeight(layout.rowCount);
    const width = getHudWidth(
      ctx.sessionHudShowStateLabels !== false,
      ctx.sessionHudShowContextUsage !== false
    );
    const widthScale = getHudWidthScale(scale);
    lastHudHeight = height;
    return computeSessionHudBounds({ hitRect, anchorRect, workArea, width, height, scale, widthScale });
  }

  function showSessionHud(win) {
    if (!win || win.isDestroyed() || !didFinishLoad) return;
    if (!win.isVisible()) {
      win.showInactive();
      keepOutOfTaskbar(win);
      if (isMac) deferMacFloatingVisibility(ctx, win);
      else if (typeof ctx.reapplyMacVisibility === "function") ctx.reapplyMacVisibility();
    }
    scheduleAutoDismiss();
    notifyReservedOffsetIfChanged();
  }

  function syncSessionHud(snapshot = latestSnapshot || getCurrentSnapshot(), options = {}) {
    latestSnapshot = snapshot;
    // Defend against stale reveal: if base eligibility dropped (last session
    // ended AND quota went away), clear any leftover clickRevealed so a future
    // new session does not pop the UI without a fresh user click.
    if (!baseEligible(snapshot)) {
      clearReveal();
    }
    syncAutoHidePollLifecycle();

    const show = shouldShow(snapshot);
    // Resolve the scale ONCE per sync and feed the same value to both windows
    // and the bounds math — separate reads could disagree mid-display-crossing.
    const scale = getTextScale();

    // ── Session HUD (sessions only; gated by its own master, independent of
    // the quota ring) ──
    const hudEnabled = ctx.sessionHudEnabled !== false;
    const hasSessions = snapshotHasVisibleSessions(snapshot);
    const hudComputed = show && hudEnabled && hasSessions ? computeBounds(snapshot, scale) : null;
    if (!hudComputed) {
      hideSessionHud();
    } else {
      const win = ensureSessionHud();
      if (win && !win.isDestroyed()) {
        applyZoomToWindow(win, scale);
        hudFlippedAbove = !!hudComputed.flippedAbove;
        win.setBounds(hudComputed.bounds);
        if (options.sendSnapshot !== false) sendSnapshot(snapshot);
        showSessionHud(win);
      }
    }

    // ── Quota ring (quota only; attached beside the pet) ──
    const ring = show
      ? computeRingBounds(
        snapshot,
        scale,
        collectRingAvoidRects(hudComputed ? hudComputed.contentBounds : null)
      )
      : null;
    if (!ring) {
      hideQuotaRing();
    } else {
      const rwin = ensureQuotaRing();
      if (rwin && !rwin.isDestroyed()) {
        applyZoomToWindow(rwin, scale);
        rwin.setBounds(ring.bounds);
        // Send the side whenever it flips (edge crossing) even on a
        // reposition-only sync, or the renderer keeps the stale layout.
        const sideChanged = ring.side !== ringSide;
        ringSide = ring.side;
        if (options.sendSnapshot !== false || sideChanged) sendRingSnapshot(snapshot, ring.side);
        showQuotaRing(rwin);
      }
    }
  }

  function broadcastSessionSnapshot(snapshot) {
    syncSessionHud(snapshot);
  }

  function repositionSessionHud() {
    syncSessionHud(latestSnapshot || getCurrentSnapshot(), { sendSnapshot: false });
  }

  function getHudReservedOffset() {
    return readHudReservedOffset();
  }

  function readHudReservedOffset() {
    if (!hudWindow || hudWindow.isDestroyed() || !hudWindow.isVisible()) return 0;
    if (hudFlippedAbove) return 0;
    // computeHudReservedOffset works in CSS px; consumers (bubble avoidance)
    // position windows in DIP.
    return scaleHeight(computeHudReservedOffset(lastHudHeight), getTextScale());
  }

  function notifyReservedOffsetIfChanged() {
    const next = readHudReservedOffset();
    if (next === lastReservedOffset) return;
    lastReservedOffset = next;
    if (typeof ctx.onReservedOffsetChange === "function") ctx.onReservedOffsetChange(next);
  }

  function cleanup() {
    stopRevealPolling();
    if (hudWindow && !hudWindow.isDestroyed()) hudWindow.destroy();
    hudWindow = null;
    didFinishLoad = false;
    hudFlippedAbove = false;
    if (ringWindow && !ringWindow.isDestroyed()) ringWindow.destroy();
    ringWindow = null;
    ringDidFinishLoad = false;
    lastHudHeight = HUD_ROW_HEIGHT;
    notifyReservedOffsetIfChanged();
  }

  return {
    ensureSessionHud,
    broadcastSessionSnapshot,
    repositionSessionHud,
    syncSessionHud,
    sendI18n,
    getHudReservedOffset,
    cleanup,
    getWindow: () => hudWindow,
    getQuotaRingWindow: () => ringWindow,
    // v5 three-state API
    revealFromPet,
    handlePinnedChanged,
    clearReveal,
    dismissFromInteraction,
  };
};

module.exports.__test = {
  computeSessionHudBounds,
  computeHudLayout,
  getHudMaxExpandedRows,
  computeHudHeight,
  countQuotaCoins,
  computeHudReservedOffset,
  isHudSession,
  getHudWidth,
  getHudWidthScale,
  computeHudOuterWidth,
  evaluateBaseEligible,
  evaluateShouldShow,
  pointInExpandedRect,
  computeAutoHideHotZone,
  pointInHotZone,
  constants: {
    HUD_WIDTH,
    HUD_WIDTH_COMPACT,
    HUD_WIDTH_LABELS,
    HUD_WIDTH_LABELS_COMPACT,
    HUD_CONTEXT_USAGE_WIDTH_BUMP,
    HUD_LABELS_ONLY_WIDTH_TRIM,
    HUD_HEIGHT,
    HUD_ROW_HEIGHT,
    HUD_MAX_EXPANDED_ROWS,
    HUD_MAX_EXPANDED_ROWS_LABELS,
    HUD_WINDOW_SHELL,
    HUD_PET_GAP,
    BUBBLE_GAP,
    EDGE_MARGIN,
    HUD_BORDER_Y,
    HOT_ZONE_PAD,
    ELIGIBILITY_POLL_MS,
    REVEAL_AUTO_DISMISS_MS,
    HUD_WIDTH_GROWTH_RATIO,
  },
};
