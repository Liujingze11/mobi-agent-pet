"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MobiDashboardOffice = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ACTIONS = Object.freeze([
    Object.freeze({ id: "typing", duration: 35000, frameMs: 220 }),
    Object.freeze({ id: "mouse", duration: 24000, frameMs: 420 }),
    Object.freeze({ id: "phone", duration: 22000, frameMs: 620 }),
    Object.freeze({ id: "coffee", duration: 5000, frameMs: 1250 }),
  ]);
  const CYCLE = ACTIONS.reduce((sum, action) => sum + action.duration, 0);
  const CODE = 'function work() {\n  const task = next();\n  return task.run();\n}';
  const TERMINAL = ["> npm run dev\nstarting…", "> npm run dev\nReady", "> checking tasks…\n3 passed", "> build complete\nReady"];
  // Register the supplied raster frames at the head, keeping the seated spot
  // fixed while hands and props move. Coordinates are local atlas-cell pixels.
  const ANCHORS = {
    "mobi-a": [[60,123],[61,123],[60,123],[60,123],[60,109],[61,109],[60,109],[60,108],[61,84],[62,83],[61,84],[61,84],[61,71],[64,71],[64,71],[61,71]],
    "mobi-b": [[66,119],[67,119],[66,119],[66,119],[66,111],[67,111],[66,111],[66,111],[66,82],[68,81],[67,81],[67,81],[66,68],[67,66],[66,68],[66,68]],
    "mobi-c": [[60,121],[60,122],[60,123],[50,122],[57,108],[55,107],[55,107],[49,105],[58,92],[60,92],[55,92],[54,92],[59,66],[55,66],[53,65],[55,67]],
  };

  function getFrame(elapsed, mode = "working") {
    const rows = mode === "working" ? [0, 1] : mode === "idle" ? [1, 2] : [1];
    const duration = rows.reduce((sum, row) => sum + ACTIONS[row].duration, 0);
    let local = Math.max(0, Number(elapsed) || 0) % duration;
    for (const row of rows) {
      const action = ACTIONS[row];
      if (local < action.duration) return { action: action.id, row, frame: Math.floor(local / action.frameMs) % 4 };
      local -= action.duration;
    }
  }

  function deriveMode(sessions) {
    const list = Array.isArray(sessions) ? sessions.filter(Boolean) : [];
    if (list.some(session => ["waiting", "attention", "notification"].includes(session.state))) return "waiting";
    if (list.some(session => session.state === "error")) return "error";
    if (list.some(session => ["working", "thinking", "building", "juggling"].includes(session.state) || session.badge === "running")) return "working";
    if (list.some(session => session.state === "complete" || session.badge === "done")) return "complete";
    return "idle";
  }

  function getScreen(elapsed, action) {
    const time = Math.max(0, Number(elapsed) || 0);
    const typingTime = time % CYCLE;
    return {
      code: action === "typing" ? CODE.slice(0, Math.min(CODE.length, 3 + Math.floor(typingTime / 95))) : CODE,
      terminal: TERMINAL[Math.floor(time / 2000) % TERMINAL.length],
    };
  }

  function create({ container, now = () => Date.now(), autoStart = true, reducedMotion } = {}) {
    if (!container) throw new TypeError("Office scene needs a container");
    const doc = container.ownerDocument;
    const view = doc.defaultView;
    const media = typeof view.matchMedia === "function" ? view.matchMedia("(prefers-reduced-motion: reduce)") : null;
    let reduce = reducedMotion == null ? !!(media && media.matches) : !!reducedMotion;
    let elapsed = 0;
    let lastTime = now();
    let active = false;
    let timer = null;
    let themeId = null;
    let fallbackUrl = "";
    let mode = "idle";
    let pendingMode = mode;
    let pendingSince = 0;
    let modeStarted = 0;
    let actionStarted = 0;
    let previousAction = "mouse";
    let coffeeStarted = null;
    let lastCoffee = -Infinity;
    let receivedSessions = false;
    const assets = "../assets/dashboard-office/";

    container.classList.add("office-scene");
    // Static, app-owned markup; theme names and asset URLs never enter HTML.
    container.innerHTML = '<div class="office-art"><img class="office-background" src="' + assets + 'office-background.png" alt="" draggable="false">' +
      [0,1,2].map(index => '<div class="office-npc office-npc--' + index + '"><img src="' + assets + 'npc-atlas.png" alt="" draggable="false"></div>').join("") +
      '<div class="office-screen" aria-hidden="true"><div class="office-editor-bar"><span>● ● ●</span><b>agent.ts</b></div>' +
      '<div class="office-editor-body"><aside class="office-files">src<br>agent.ts<br>tasks.ts</aside><pre class="office-code"></pre><span class="office-caret">▏</span></div>' +
      '<pre class="office-terminal"></pre><span class="office-pointer">↖</span></div>' +
      '<div class="office-actor" aria-hidden="true"><img src="' + assets + 'actor-mobi-a.png" alt="" draggable="false"></div>' +
      '<img class="office-chair-front" src="' + assets + 'office-background.png" alt="" draggable="false">' +
      '<img class="office-custom-pet" alt="" draggable="false" hidden></div>';
    const sprite = container.querySelector(".office-actor img");
    const actor = container.querySelector(".office-actor");
    const custom = container.querySelector(".office-custom-pet");
    const code = container.querySelector(".office-code");
    const terminal = container.querySelector(".office-terminal");
    const coworkers = Array.from(container.querySelectorAll(".office-npc img"));

    function currentFrame() {
      if (reduce) return getFrame(0, "working");
      if (coffeeStarted != null && elapsed - coffeeStarted < 5000) {
        return { action: "coffee", row: 3, frame: Math.min(3, Math.floor((elapsed - coffeeStarted) / 1250)) };
      }
      return getFrame(elapsed - modeStarted, mode);
    }

    function applyMode(next) {
      mode = next;
      modeStarted = elapsed;
      actionStarted = elapsed;
      coffeeStarted = null;
      if (["waiting", "complete"].includes(next) && elapsed - lastCoffee >= 120000) {
        coffeeStarted = elapsed;
        lastCoffee = elapsed;
      }
    }

    function setSessions(sessions) {
      const next = deriveMode(sessions);
      if (!receivedSessions) {
        receivedSessions = true;
        pendingMode = next;
        applyMode(next);
        paint();
      } else if (next !== pendingMode) {
        pendingMode = next;
        pendingSince = elapsed;
      }
    }

    function paint() {
      if (!reduce && pendingMode !== mode && elapsed - pendingSince >= 2000 && elapsed - actionStarted >= 8000) applyMode(pendingMode);
      const frame = currentFrame();
      if (frame.action !== previousAction) { previousAction = frame.action; actionStarted = elapsed; }
      container.dataset.action = frame.action;
      container.dataset.mode = mode;
      container.dataset.frame = String(frame.frame);
      container.dataset.paused = String(!active || reduce);
      const anchor = (ANCHORS[themeId] || ANCHORS["mobi-a"])[frame.row * 4 + frame.frame];
      sprite.style.left = `${-frame.frame * 100 + (60 - anchor[0]) / 271.5 * 100}%`;
      sprite.style.top = `${-frame.row * 100 + (90 - anchor[1]) / 362 * 100}%`;
      coworkers.forEach((coworker, index) => {
        const phase = reduce ? 0 : Math.floor((elapsed + index * 1350) / (480 + index * 180)) % 8;
        const column = [0,1,2,3,2,1,0,0][phase];
        coworker.style.left = `${-column * 100}%`;
        coworker.style.top = `${-index * 100 + (50 - [90,99,39][index]) / 362 * 100}%`;
        coworker.dataset.frame = String(column);
      });
      const screen = getScreen(elapsed - modeStarted, frame.action);
      code.textContent = reduce ? CODE : screen.code;
      terminal.textContent = reduce ? TERMINAL[1] : screen.terminal;
    }

    function tick() {
      const time = now();
      if (active && !reduce) elapsed += Math.max(0, time - lastTime);
      lastTime = time;
      paint();
    }

    function setActive(value) {
      tick();
      active = !!value;
      lastTime = now();
      paint();
      if (autoStart && active && !reduce && timer == null) timer = view.setInterval(tick, 110);
      if ((!active || reduce) && timer != null) { view.clearInterval(timer); timer = null; }
    }

    function setTheme(scene) {
      if (!scene || typeof scene !== "object") return;
      fallbackUrl = typeof scene.imageUrl === "string" ? scene.imageUrl : "";
      const nextId = typeof scene.themeId === "string" ? scene.themeId : "mobi-a";
      if (nextId === themeId) {
        if (!ANCHORS[nextId] && fallbackUrl && custom.getAttribute("src") !== fallbackUrl) {
          custom.src = fallbackUrl;
          custom.hidden = false;
          actor.hidden = true;
        }
        return;
      }
      themeId = nextId;
      const mobi = ["mobi-a", "mobi-b", "mobi-c"].includes(nextId);
      actor.hidden = !mobi && !!fallbackUrl;
      custom.hidden = mobi || !fallbackUrl;
      container.dataset.pet = mobi ? nextId : "custom";
      if (mobi) sprite.src = `${assets}actor-${nextId}.png`;
      else if (fallbackUrl) custom.src = fallbackUrl;
    }

    function onSpriteError() {
      if (!fallbackUrl || sprite.getAttribute("src") === `${assets}actor-mobi-a.png`) return;
      actor.hidden = true;
      custom.hidden = false;
      custom.src = fallbackUrl;
    }
    sprite.addEventListener("error", onSpriteError);
    function onCustomError() {
      custom.hidden = true;
      actor.hidden = false;
      sprite.src = `${assets}actor-mobi-a.png`;
    }
    custom.addEventListener("error", onCustomError);
    function onMotionChange(event) {
      reduce = event.matches;
      setActive(active);
    }
    if (media && reducedMotion == null) media.addEventListener("change", onMotionChange);
    paint();

    return {
      tick, setActive, setTheme, setSessions,
      getState: () => ({ elapsed, mode, ...currentFrame() }),
      destroy() {
        if (timer != null) view.clearInterval(timer);
        timer = null;
        active = false;
        sprite.removeEventListener("error", onSpriteError);
        custom.removeEventListener("error", onCustomError);
        if (media && reducedMotion == null) media.removeEventListener("change", onMotionChange);
      },
    };
  }

  return { ACTIONS, CODE, getFrame, getScreen, deriveMode, create };
});
