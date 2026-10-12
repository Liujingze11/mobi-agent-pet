// --- Input window: pointer capture, drag, click detection ---
// This is the "controller" — all input decisions happen here.
// Render window is pure "view" — receives reaction commands via IPC relay.

const area = document.getElementById("hit-area");

// ── Theme config (injected via preload-hit.js additionalArguments) ──
let tc = window.hitThemeConfig || {};
let _reactions = (tc && tc.reactions) || {};

// ── Platform (injected via preload-hit.js additionalArguments) ──
const isMac = !!(window.hitPlatform && window.hitPlatform.isMac);

// Theme switch: IPC push overrides additionalArguments
if (window.hitAPI && window.hitAPI.onThemeConfig) {
  window.hitAPI.onThemeConfig((cfg) => {
    tc = cfg || {};
    _reactions = (tc && tc.reactions) || {};
  });
}

// --- State synced from main ---
let currentSvg = null;
let currentState = null;
let dndEnabled = false;

window.hitAPI.onStateSync((data) => {
  if (data.dndEnabled === true) {
    lastHudClick = null;
    hudRevealedFromPointer = false;
  }
  if (data.currentSvg !== undefined) currentSvg = data.currentSvg;
  if (data.currentState !== undefined) currentState = data.currentState;
  if (data.dndEnabled !== undefined) dndEnabled = data.dndEnabled;
});

// --- Drag state ---
let isDragging = false;
let didDrag = false;
let mouseDownX, mouseDownY;
let lastDragScreenX;
let dragReactionDirection = null;
let dragMoveRAF = null;
const { dragThreshold: DRAG_THRESHOLD, doubleClickMs: DOUBLE_CLICK_MS,
  doubleClickDistance: DOUBLE_CLICK_DISTANCE } = globalThis.MobiPetInputPolicy;
let lastHudClick = null;
let hudRevealedFromPointer = false;
let pointerGesture = 0;

function pointerPosition(event) {
  return {
    x: Number.isFinite(event.screenX) ? event.screenX : event.clientX,
    y: Number.isFinite(event.screenY) ? event.screenY : event.clientY,
  };
}

function recordHudClick(event) {
  if (dndEnabled) { lastHudClick = null; return; }
  const point = pointerPosition(event);
  const now = Date.now();
  if (lastHudClick && now - lastHudClick.time <= DOUBLE_CLICK_MS
    && Math.abs(point.x - lastHudClick.x) <= DOUBLE_CLICK_DISTANCE
    && Math.abs(point.y - lastHudClick.y) <= DOUBLE_CLICK_DISTANCE) {
    lastHudClick = null;
    hudRevealedFromPointer = true;
    window.hitAPI.revealSessionHud();
  } else {
    lastHudClick = { ...point, time: now };
  }
}

window.hitAPI.onDragStarted((result) => {
  // A delayed main-process result belongs only to the matching press.
  if (!result || result.gestureId !== pointerGesture) return;
  didDrag = true;
  lastHudClick = null;
  hudRevealedFromPointer = false;
});

// --- Reaction state (tracked here to gate input) ---
let isReacting = false;
let isDragReacting = false;

// Cancel signal from main (e.g. state change)
window.hitAPI.onCancelReaction(() => {
  if (isDragging) return;
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; clickCount = 0; firstClickDir = null; }
  isReacting = false;
  isDragReacting = false;
  dragReactionDirection = null;
});

function queueDragMove() {
  if (dragMoveRAF !== null) return;
  dragMoveRAF = requestAnimationFrame(() => {
    dragMoveRAF = null;
    if (!isDragging) return;
    window.hitAPI.dragMove();
  });
}

function clearQueuedDragMove() {
  if (dragMoveRAF === null) return;
  cancelAnimationFrame(dragMoveRAF);
  dragMoveRAF = null;
}

// --- Pointer handlers ---
area.addEventListener("pointerdown", (e) => {
  if (e.button === 0) {
    hudRevealedFromPointer = false;
    pointerGesture++;
    area.setPointerCapture(e.pointerId);
    isDragging = true;
    didDrag = false;
    const point = pointerPosition(e);
    mouseDownX = point.x;
    mouseDownY = point.y;
    lastDragScreenX = point.x;
    dragReactionDirection = null;
    window.hitAPI.dragLock(true, pointerGesture);
    area.classList.add("dragging");
    startDragReaction(null);
  }
});

document.addEventListener("pointermove", (e) => {
  if (isDragging) {
    const point = pointerPosition(e);
    if (!didDrag) {
      const totalDx = point.x - mouseDownX;
      const totalDy = point.y - mouseDownY;
      if (Math.abs(totalDx) > DRAG_THRESHOLD || Math.abs(totalDy) > DRAG_THRESHOLD) {
        didDrag = true;
        lastHudClick = null;
        startDragReaction(totalDx < 0 ? "left" : (totalDx > 0 ? "right" : null));
      }
    } else {
      const stepDx = point.x - lastDragScreenX;
      if (stepDx !== 0) startDragReaction(stepDx < 0 ? "left" : "right");
    }
    lastDragScreenX = point.x;
    queueDragMove();
  }
});

function stopDrag() {
  if (!isDragging) return;
  clearQueuedDragMove();
  isDragging = false;
  window.hitAPI.dragLock(false, pointerGesture);
  area.classList.remove("dragging");
  if (didDrag) {
    window.hitAPI.dragEnd();
  }
  endDragReaction();
}

document.addEventListener("pointerup", (e) => {
  if (e.button !== 0) return;
  const hadPress = isDragging;
  // Transparent windows may deliver release before coalesced pointermove.
  // Use the release coordinates too, so a drag cannot become a double-click.
  const point = pointerPosition(e);
  if (isDragging && (Math.abs(point.x - mouseDownX) > DRAG_THRESHOLD || Math.abs(point.y - mouseDownY) > DRAG_THRESHOLD)) {
    didDrag = true;
  }
  const wasDrag = didDrag;
  stopDrag();
  if (wasDrag) { lastHudClick = null; return; }

  // macOS Ctrl-click is the system right-click gesture. Suppress it like
  // other pet context-menu requests, without treating it as a Dashboard
  // shortcut or leaking into the click accumulator.
  if (isMac && e.ctrlKey && !e.metaKey) {
    lastHudClick = null;
    resetClickAccumulator();
    return;
  }

  // Dashboard shortcut: Cmd-click on mac, Ctrl-click elsewhere.
  const isDashboardShortcut = isMac ? e.metaKey : (e.ctrlKey && !e.metaKey);
  if (isDashboardShortcut) {
    lastHudClick = null;
    resetClickAccumulator();
    window.hitAPI.showDashboard();
    return;
  }

  if (e.ctrlKey || e.metaKey) lastHudClick = null;
  else if (hadPress) recordHudClick(e);
  handleClick(e.clientX);
});

document.addEventListener("dblclick", (e) => {
  if (e.button !== 0 || e.ctrlKey || e.metaKey || dndEnabled || isDragging || didDrag) return;
  e.preventDefault();
  // Keep the native event for the OS-configured interval; the independent
  // pointer pair handles jitter and held-state updates that suppress it.
  if (hudRevealedFromPointer) { hudRevealedFromPointer = false; return; }
  lastHudClick = null;
  window.hitAPI.revealSessionHud();
});

function cancelDrag() { lastHudClick = null; hudRevealedFromPointer = false; stopDrag(); }
area.addEventListener("pointercancel", cancelDrag);
area.addEventListener("lostpointercapture", () => { if (isDragging) cancelDrag(); });
window.addEventListener("blur", cancelDrag);

// --- Click reaction logic (2-click = poke, 4-click = flail) ---
const CLICK_WINDOW_MS = 400;

let clickCount = 0;
let clickTimer = null;
let firstClickDir = null;

function _getReaction(name) {
  return _reactions[name] || null;
}

function resetClickAccumulator() {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
  clickCount = 0;
  firstClickDir = null;
}

// Fresh-read at reaction timer fire time, NOT closured at click time —
// state / DND may change inside the 400 ms accumulator window.
function canPlayReactionNow() {
  return currentState === "idle" && !dndEnabled && !isReacting;
}

function handleClick(clientX) {
  if (isDragReacting) return;

  clickCount++;
  if (clickCount === 1) {
    firstClickDir = clientX < area.offsetWidth / 2 ? "left" : "right";
  }

  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }

  const doubleReact = _getReaction("double");
  const annoyedReact = _getReaction("annoyed");
  const leftReact = _getReaction("clickLeft");
  const rightReact = _getReaction("clickRight");

  if (clickCount >= 4 && doubleReact) {
    clickCount = 0;
    firstClickDir = null;
    if (!canPlayReactionNow()) return;
    const files = doubleReact.files || [doubleReact.file];
    const file = files[Math.floor(Math.random() * files.length)];
    playReaction(file, doubleReact.duration || 3500);
  } else if (clickCount >= 2) {
    clickTimer = setTimeout(() => {
      clickTimer = null;
      clickCount = 0;
      const dir = firstClickDir;
      firstClickDir = null;
      if (!canPlayReactionNow()) return;
      if (annoyedReact && Math.random() < 0.5) {
        playReaction(annoyedReact.file, annoyedReact.duration || 3500);
      } else if (leftReact && rightReact) {
        const react = dir === "left" ? leftReact : rightReact;
        playReaction(react.file, react.duration || 2500);
      }
    }, CLICK_WINDOW_MS);
  } else {
    clickTimer = setTimeout(() => {
      clickTimer = null;
      clickCount = 0;
      firstClickDir = null;
      // A plain single click has no action.
    }, CLICK_WINDOW_MS);
  }
}

function playReaction() {} // Legacy click feedback cannot select an unassigned file.

// --- Drag reaction ---
function startDragReaction(direction) {
  if (dndEnabled) return;
  if (isDragReacting && dragReactionDirection === direction) return;

  if (isReacting) {
    isReacting = false;
  }

  isDragReacting = true;
  dragReactionDirection = direction;
  // drag-lock informs the main-process state controller.
}

function endDragReaction() {
  if (!isDragReacting) return;
  isDragReacting = false;
  dragReactionDirection = null;
  // drag-lock release restores the latest main-process state.
}

// --- OS file drop → open terminal at that directory (#459, Windows/Linux only) ---
// macOS is OUT: the pet windows live at screen-saver level so they stay above
// fullscreen apps, and macOS drag-destination search never delivers drag
// events to windows at that level (real-machine bisect, 2026-06-11 — lowering
// only the hit window doesn't help either, the overlapping screen-saver render
// window still blocks the search; ignoresMouseEvents passes mouse events
// through but NOT drag destinations). Don't re-attempt without changing the
// window-level model; listeners are simply not registered on mac.
//
// Affordance gating lives HERE (not only in main): in mini mode dragover must
// not preventDefault, so the OS shows "no drop" instead of a copy cursor that
// would then do nothing. Main re-checks mini (and platform) as the second layer.
function dragHasFiles(e) {
  const types = e.dataTransfer && e.dataTransfer.types;
  if (!types) return false;
  for (const t of types) { if (t === "Files") return true; }
  return false;
}

if (!isMac) {
  area.addEventListener("dragover", (e) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  area.addEventListener("drop", (e) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    const paths = [];
    for (const file of e.dataTransfer.files || []) {
      const p = window.hitAPI.getPathForFile(file);
      if (typeof p === "string" && p) paths.push(p);
    }
    if (paths.length) window.hitAPI.dropPaths(paths);
  });

  // Main confirmed the drop opened a terminal → react. Routed back through the
  // local playReaction so isReacting gating stays consistent. Best-effort with a
  // fallback chain: double (Clawd) → clickLeft/clickRight poke (Calico) →
  // nothing (Cloudling only ships a drag reaction; no new theme capability is
  // invented for drops).
  window.hitAPI.onDropAccepted(() => {
    if (!canPlayReactionNow()) return;
    const doubleReact = _getReaction("double");
    if (doubleReact) {
      const files = doubleReact.files || [doubleReact.file];
      playReaction(files[Math.floor(Math.random() * files.length)], doubleReact.duration || 3500);
      return;
    }
    const left = _getReaction("clickLeft");
    const right = _getReaction("clickRight");
    const poke = left && right ? (Math.random() < 0.5 ? left : right) : (left || right);
    if (poke) playReaction(poke.file, poke.duration || 2500);
  });
}

// --- Suppress pet context menus, including the browser default ---
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});
