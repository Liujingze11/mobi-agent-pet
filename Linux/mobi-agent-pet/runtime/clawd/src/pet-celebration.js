"use strict";

function createConfetti(width, height) {
  const count = Math.ceil(Math.max(144, Math.min(720, width * height / 1800)) / 24) * 24;
  const size = Math.max(2.8, Math.min(7, width / 200)), margin = size * 2 + 3;
  const colors = ["#f19baf", "#efc05c", "#86bddb", "#d6b1e6"];
  return Array.from({ length: count }, (_, i) => ({
    x: margin + ((i % 24) + .5 + ((i * 17) % 7 - 3) * .07) * (width - margin * 2) / 24,
    yStart: -size * 3, yEnd: height + size * 3,
    delayMs: 820 + (Math.floor(i / 24) % 6) * 480 + (i * 37) % 260 + Math.floor(i / 144) * 40,
    fallMs: 2600 + (i * 71) % 650,
    drift: (i % 2 ? 1 : -1) * size * 1.7,
    turn: (i % 2 ? 1 : -1) * (180 + i * 13 % 180),
    size, color: colors[(i * 7 + Math.floor(i / 24)) % 4], shape: i % 3,
  }));
}

function renderConfettiLayer(width, height, durationMs = 8000, loop = true) {
  const pieces = createConfetti(width, height);
  const css = [".party-confetti .confetti{opacity:0;transform-box:view-box;pointer-events:none}"];
  const markup = pieces.map((p, i) => {
    const start = p.delayMs / durationMs * 100, end = (p.delayMs + p.fallMs) / durationMs * 100;
    const middle = (start + end) / 2, halfway = (p.yStart + p.yEnd) / 2;
    css.push(`.confetti-${i}{transform-origin:${p.x}px 0;animation:party-rain-${i} ${durationMs / 1000}s linear ${loop ? "infinite" : "1 forwards"}}@keyframes party-rain-${i}{0%,${start}%{opacity:0;translate:0 ${p.yStart}px;rotate:0deg}${start + .01}%{opacity:1;translate:0 ${p.yStart}px;rotate:0deg}${middle}%{opacity:1;translate:${p.drift}px ${halfway}px;rotate:${p.turn / 2}deg}${end}%{opacity:1;translate:${-p.drift}px ${p.yEnd}px;rotate:${p.turn}deg}${end + .01}%,100%{opacity:0;translate:${-p.drift}px ${p.yEnd}px;rotate:${p.turn}deg}}`);
    const shape = p.shape === 0
      ? '<path d="M0 -1 L.25 -.25 L1 0 L.25 .25 L0 1 L-.25 .25 L-1 0 L-.25 -.25 Z"/>'
      : p.shape === 1 ? '<rect x="-.4" y="-1" width=".8" height="2" rx=".1"/>'
        : '<path d="M-.8 -.5 Q.2 -1 .8 -.2 L.3 .8 Q-.3 .3 -.8 .5 Z"/>';
    return `<g class="confetti confetti-${i}" fill="${p.color}" stroke="#333433" stroke-width=".65"><g transform="translate(${p.x} 0) scale(${p.size})" stroke-width="${.65 / p.size}">${shape}</g></g>`;
  }).join("");
  css.push("@media(prefers-reduced-motion:reduce){.party-confetti{display:none}}");
  return { css: css.join("\n"), markup: `<g class="party-confetti">${markup}</g>` };
}


function celebrationHtml(width, height) {
  const layer = renderConfettiLayer(width, height, 8000, false);
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;pointer-events:none}svg{width:100%;height:100%}${layer.css}</style><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">${layer.markup}</svg>`;
}

function createPetCelebration(options) {
  const { BrowserWindow, screen, getPetBounds, isAllowed = () => true, timers = globalThis } = options;
  let window = null, timer = null, activeState = null;
  function stop() {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    const previous = window;
    window = null;
    activeState = null;
    if (previous && !previous.isDestroyed()) previous.destroy();
  }
  function playFrame(theme, frame) {
    if (!isAllowed() || !theme?._builtin || !["mobi-a", "mobi-b", "mobi-c"].includes(theme._id) || frame?.file !== "celebration-screen.svg") { stop(); return; }
    if (frame.replay === false && window && !window.isDestroyed() && activeState === frame.state) return;
    stop();
    const bounds = screen.getDisplayMatching(getPetBounds()).bounds;
    const owned = new BrowserWindow({
      ...bounds, frame: false, transparent: true, backgroundColor: "#00000000",
      show: false, focusable: false, skipTaskbar: true, resizable: false,
      hasShadow: false, fullscreenable: false, ...(options.windowType ? { type: options.windowType } : {}),
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    window = owned;
    activeState = frame.state;
    owned.setIgnoreMouseEvents(true);
    owned.setAlwaysOnTop(true, options.topmostLevel || "screen-saver");
    owned.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    owned.on("closed", () => { if (window === owned) stop(); });
    timer = timers.setTimeout(stop, 8000);
    timer?.unref?.();
    owned.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(celebrationHtml(bounds.width, bounds.height)))
      .then(() => {
        if (window !== owned || owned.isDestroyed()) return;
        if (!isAllowed()) { stop(); return; }
        // Initial creation can be clamped by the window manager to the work area.
        owned.setBounds(bounds);
        owned.showInactive();
      }).catch(() => { if (window === owned) stop(); });
  }
  return { playFrame, stop, stateChanged(state) { if (state !== activeState) stop(); } };
}

module.exports = { createConfetti, renderConfettiLayer, celebrationHtml, createPetCelebration };
