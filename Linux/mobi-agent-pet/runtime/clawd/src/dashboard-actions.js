"use strict";
(function(root) {
  const labels = {
    zh: { title: "动作管理", idle: "空闲", roam: "漫游", working: "工作", waiting: "等待", complete: "完成", error: "错误", held: "被提起", random: "随机播放", sequence: "按顺序播放", seconds: "秒", add: "添加", save: "保存", reset: "恢复默认", saved: "已保存", dirty: "未保存", empty: "拖到这里", fallback: "空闲至少保留一个动作", duplicate: "此状态已有这个动作", move: "移到", remove: "移回动作库", preview: "播放预览", up: "上移", down: "下移", loadFail: "动作加载失败", restartRequired: "请从托盘完全退出桌面宠物，再重新启动开发版。", loading: "正在加载…", saveFail: "保存失败", tip: "拖动卡片，自由安排", library: "动作库", libraryTip: "拖回这里停用", reload: "重试", help: "空状态使用空闲动作；配置按主题保存。", stop: "停止预览" },
    en: { title: "Actions", idle: "Idle", roam: "Roam", working: "Work", waiting: "Waiting", complete: "Complete", error: "Error", held: "Held", random: "Play randomly", sequence: "Play in order", seconds: "sec", add: "Add", save: "Save", reset: "Restore defaults", saved: "Saved", dirty: "Unsaved", empty: "Drop here", fallback: "Keep one idle action", duplicate: "Already in this state", move: "Move to", remove: "Return to library", preview: "Play preview", up: "Move up", down: "Move down", loadFail: "Unable to load actions", restartRequired: "Fully quit from the tray, then restart the development app.", loading: "Loading…", saveFail: "Unable to save", tip: "Drag actions into any state", library: "Action library", libraryTip: "Drop here to remove", reload: "Retry", help: "Empty states use idle actions. Saved per theme.", stop: "Stop preview" }
  };
  const fileNames = { idle: "发呆", thinking: "思考", working: "打字", typing: "打字", juggling: "杂耍", building: "搭建", sweeping: "清扫", carrying: "搬运", attention: "庆祝", happy: "开心", notification: "提醒", error: "惊讶", yawning: "打哈欠", dozing: "打瞌睡", collapsing: "躺下", sleeping: "睡觉", waking: "醒来", roam: "走动", drag: "悬空", double: "欢呼", reading: "看书", patrol: "巡视", follow: "目光跟随", look: "张望", bubble: "吹泡泡" };
  const paths = {
    up: "m6 14 6-6 6 6",
    down: "m6 10 6 6 6-6",
    remove: "M6 6l12 12M18 6 6 18",
    reset: "M3 10a9 9 0 1 1 2 8M3 4v6h6",
    save: "m5 12 4 4L19 6",
    add: "M12 5v14M5 12h14",
    random: "M3 7h3l12 10h3M3 17h3L18 7h3M17 3l4 4-4 4M17 13l4 4-4 4",
    sequence: "M4 6h2M10 6h10M4 12h2M10 12h10M4 18h2M10 18h10"
  };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function create({ container, getLang = () => "en" }) {
    const api = root.settingsAPI, model = root.MobiPetActions;
    let data = null, draft = null, visible = false, dirty = false, busy = false, seq = 0, notice = "", dragged = null, reloadAfterSave = false, loading = false, previewSerial = 0;
    const previewCleanups = /* @__PURE__ */ new Set();
    const t = (key) => (labels[getLang()] || labels.en)[key] || labels.en[key] || key;
    function element(tag, text, cls) {
      const el = document.createElement(tag);
      if (text !== void 0) el.textContent = text;
      if (cls) el.className = cls;
      return el;
    }
    function icon(key) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.7");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute("d", paths[key]);
      svg.append(path);
      return svg;
    }
    function button(key, invoke, attr, compact = false) {
      const el = element("button", void 0, compact ? "pet-action-icon" : "pet-action-button");
      el.type = "button";
      el.title = t(key);
      el.setAttribute("aria-label", t(key));
      if (paths[key]) el.append(icon(key));
      if (!compact) el.append(element("span", t(key)));
      if (attr) el.setAttribute(attr, "");
      el.disabled = busy;
      el.addEventListener("click", invoke);
      return el;
    }
    function name(file) {
      const clean = file.replace(/\.(svg|gif|apng|png|webp|jpe?g)$/i, "").replace(/^(clawd|calico|cloudling|mobi-[abc])-/, "");
      if (getLang() !== "zh") return clean.replace(/-/g, " ");
      if (data && data.actionManagement.labels && typeof data.actionManagement.labels[file] === "string") return data.actionManagement.labels[file];
      return fileNames[clean] || fileNames[clean.split("-").at(-1)] || clean.replace(/-/g, " ");
    }
    function durationFor(file) {
      return model.actionDuration({ actionDurations: data.actionManagement.durations }, file);
    }
    function clearPreviews() {
      for (const stop of previewCleanups) stop();
      previewCleanups.clear();
    }
    function change(fn) {
      if (busy) return;
      fn();
      dirty = true;
      notice = "";
      render();
    }
    function canRemove(state, index) {
      return state !== "idle" || !draft.states.idle.actions[index].enabled || draft.states.idle.actions.filter((a) => a.enabled).length > 1;
    }
    function transfer(source, to, targetIndex) {
      if (busy || !source) return;
      if (to === "library") {
        if (!source.state) return;
        const action = draft.states[source.state].actions[source.index];
        if (!action) return;
        if (!canRemove(source.state, source.index)) {
          notice = t("fallback");
          render();
          return;
        }
        // Keep v1 membership metadata for compatibility with existing settings.
        change(() => { action.enabled = false; });
        return;
      }
      if (!model.STATE_IDS.includes(to)) return;
      const actions = draft.states[to].actions;
      const action = source.state ? draft.states[source.state].actions[source.index] : { file: source.file, enabled: true, durationMs: durationFor(source.file) };
      if (!action) return;
      const existing = actions.findIndex((a) => a.file === action.file);
      if (source.state !== to && existing >= 0 && actions[existing].enabled) {
        notice = t("duplicate");
        render();
        return;
      }
      if (source.state && source.state !== to && !canRemove(source.state, source.index)) {
        notice = t("fallback");
        render();
        return;
      }
      change(() => {
        let index = targetIndex === void 0 ? actions.length : targetIndex;
        if (source.state) {
          draft.states[source.state].actions.splice(source.index, 1);
          if (source.state === to && source.index < index) index--;
        }
        if (source.state !== to && existing >= 0) {
          actions.splice(existing, 1);
          if (existing < index) index--;
        }
        actions.splice(index, 0, action);
      });
    }
    function bindDrop(el, state, index) {
      el.addEventListener("dragover", (event) => {
        if (!dragged || busy || (state === "library" && !dragged.state)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = dragged.state ? "move" : "copy";
        el.classList.add("is-drop-target");
      });
      el.addEventListener("dragleave", (event) => {
        if (!el.contains(event.relatedTarget)) el.classList.remove("is-drop-target");
      });
      el.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        el.classList.remove("is-drop-target");
        const source = dragged;
        dragged = null;
        transfer(source, state, index);
      });
    }
    function livePreview(card, asset, label) {
      const box = element("div", void 0, "pet-action-preview"), img = element("img");
      img.alt = label;
      img.draggable = false;
      const url = asset && asset.fileUrl && asset.fileUrl.startsWith("file:") ? asset.fileUrl : null;
      const scripted = !!(asset && asset.needsScriptedPreviewPoster);
      const poster = asset && asset.previewImageUrl;
      const rest = poster || url;
      // SVG/GIF/APNG assets may use their animated file as the "poster".
      // Keep a local still frame so only the hovered card animates.
      const still = rest && rest === url ? element("canvas") : null;
      let frozen = false;
      if (still) {
        still.hidden = true;
        still.setAttribute("role", "img");
        still.setAttribute("aria-label", label);
        box.append(still);
      }
      if (rest) img.src = rest;
      box.append(img);
      let active = false, timer = null, frame = null;
      img.addEventListener("load", () => {
        if (!still || active || frozen || !img.naturalWidth || !img.naturalHeight) return;
        const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
        still.width = Math.max(1, Math.round(img.naturalWidth * scale));
        still.height = Math.max(1, Math.round(img.naturalHeight * scale));
        try {
          const context = still.getContext("2d");
          if (!context) return;
          context.drawImage(img, 0, 0, still.width, still.height);
          frozen = true;
          still.hidden = false;
          img.hidden = true;
        } catch (_) {
          // Assets that cannot be drawn remain available as image previews.
        }
      });
      function stop() {
        active = false;
        if (timer !== null) root.clearTimeout(timer);
        timer = null;
        if (frame) frame.remove();
        frame = null;
        img.hidden = frozen;
        if (still) still.hidden = !frozen;
        if (rest) img.src = rest;
        box.classList.remove("is-playing");
      }
      function replay() {
        if (!active || !url) return;
        const cacheUrl = `${url}${url.includes("?") ? "&" : "?"}_preview=${++previewSerial}`;
        if (scripted) {
          if (frame) frame.remove();
          frame = element("iframe");
          frame.title = label;
          frame.setAttribute("sandbox", "allow-scripts");
          frame.setAttribute("referrerpolicy", "no-referrer");
          frame.tabIndex = -1;
          frame.src = cacheUrl;
          box.append(frame);
          img.hidden = true;
        } else img.src = cacheUrl;
        const cycle = asset.cycleMs;
        timer = root.setTimeout(replay, Number.isFinite(cycle) && cycle > 0 ? Math.max(500, cycle) : 5e3);
      }
      function start() {
        if (active || !url || busy) return;
        active = true;
        if (still) still.hidden = true;
        img.hidden = false;
        box.classList.add("is-playing");
        replay();
      }
      card.addEventListener("mouseenter", start);
      card.addEventListener("mouseleave", stop);
      card.addEventListener("focusin", start);
      card.addEventListener("focusout", (event) => {
        if (!card.contains(event.relatedTarget)) stop();
      });
      previewCleanups.add(stop);
      return box;
    }
    function createCard(action, state, index, asset) {
      const library = !state, card = element("article", void 0, `pet-action-card${library ? " is-library" : ""}`);
      card.dataset.file = action.file;
      if (library) card.dataset.libraryFile = action.file;
      else card.setAttribute("data-action-card", "");
      card.tabIndex = 0;
      card.draggable = !busy;
      card.addEventListener("dragstart", (event) => {
        if (busy || event.target.closest("input, select, button")) {
          event.preventDefault();
          return;
        }
        dragged = library ? { file: action.file } : { state, index };
        card.classList.add("is-dragging");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = library ? "copy" : "move";
          event.dataTransfer.setData("text/plain", action.file);
        }
      });
      card.addEventListener("dragend", () => {
        dragged = null;
        card.classList.remove("is-dragging");
        container.querySelectorAll(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
      });
      if (!library) bindDrop(card, state, index);
      card.append(livePreview(card, asset, name(action.file)));
      const line = element("div", void 0, "pet-action-title");
      const actionName = element("strong", name(action.file));
      actionName.title = name(action.file);
      line.append(actionName);
      card.append(line);
      return card;
    }
    function render() {
      if (!visible) return;
      clearPreviews();
      dragged = null;
      container.replaceChildren();
      const bar = element("header", void 0, "pet-actions-toolbar dashboard-page-heading");
      const title = element("div", void 0, "pet-actions-heading");
      title.append(element("h1", t("title")), element("small", data ? data.theme.name : t("tip")));
      bar.append(title);
      if (data && draft) {
        const message = element("span", notice || (dirty ? t("dirty") : ""), "pet-actions-notice");
        message.setAttribute("role", "status");
        message.setAttribute("aria-live", "polite");
        bar.append(message);
        bar.append(button("reset", () => change(() => {
          draft = model.automaticPlan(data.actionManagement.defaults, { actionDurations: data.actionManagement.durations });
        }), "data-reset-actions"), button("save", () => void save(), "data-save-actions"));
      }
      container.append(bar);
      if (!data || !draft) {
        container.append(element("p", loading ? t("loading") : notice || t("loadFail"), "pet-actions-load-status"));
        if (!loading) container.append(button("reload", () => void load(), "data-reload-actions"));
        return;
      }
      const assets = new Map(data.actionManagement.assets.map((a) => [a.name, a]));
      const board = element("div", void 0, "pet-actions-board");
      for (const state of model.STATE_IDS) {
        const slot = draft.states[state], lane = element("section", void 0, "pet-actions-lane");
        lane.dataset.actionState = state;
        lane.setAttribute("aria-label", t(state));
        bindDrop(lane, state);
        const header = element("header", void 0, "pet-actions-lane-heading");
        const heading = element("h2", t(state));
        heading.append(element("span", slot.actions.filter((a) => a.enabled).length, "pet-actions-count"));
        header.append(heading);
        const modes = element("div", void 0, "pet-actions-modes");
        for (const mode of ["sequence", "random"]) {
          const b = button(mode, () => change(() => {
            slot.mode = mode;
          }), void 0, true);
          b.dataset.playMode = mode;
          b.removeAttribute("title");
          const tip = element("span", t(mode), "pet-action-mode-tooltip");
          tip.setAttribute("aria-hidden", "true");
          b.append(tip);
          b.setAttribute("aria-pressed", String(slot.mode === mode));
          modes.append(b);
        }
        header.append(modes);
        lane.append(header);
        const cards = element("div", void 0, "pet-actions-cards");
        slot.actions.forEach((action, index) => {
          if (action.enabled) cards.append(createCard(action, state, index, assets.get(action.file)));
        });
        if (!slot.actions.some((action) => action.enabled)) cards.append(element("div", t("empty"), "pet-actions-empty"));
        lane.append(cards);
        board.append(lane);
      }
      container.append(board);
      const library = element("section", void 0, "pet-actions-library");
      bindDrop(library, "library");
      const libraryHeading = element("header");
      libraryHeading.append(element("h2", t("library")), element("span", t("libraryTip")));
      library.append(libraryHeading);
      const shelf = element("div", void 0, "pet-actions-shelf");
      for (const asset of data.actionManagement.assets) shelf.append(createCard({ file: asset.name }, null, null, asset));
      library.append(shelf);
      library.title = t("help");
      container.append(library);
    }
    async function load() {
      const token = ++seq;
      loading = true;
      notice = "";
      data = null;
      draft = null;
      render();
      try {
        const next = await api.getAnimationOverridesData();
        if (!visible || token !== seq) return;
        if (!next) throw new Error(t("loadFail"));
        if (!next.actionManagement) throw new Error(t("restartRequired"));
        const nextDraft = model.automaticPlan(next.actionManagement.plan || next.actionManagement.defaults, { actionDurations: next.actionManagement.durations });
        if (!nextDraft) throw new Error(t("loadFail"));
        data = next;
        draft = nextDraft;
        dirty = false;
        notice = "";
      } catch (error) {
        if (token === seq) notice = `${t("loadFail")}: ${error.message}`;
      } finally {
        if (token === seq) {
          loading = false;
          render();
        }
      }
    }
    async function save() {
      if (busy || !data) return;
      busy = true;
      notice = "";
      render();
      const themeId = data.theme.id, saveSeq = seq, plan = clone(draft);
      try {
        const result = await api.command("setPetActionPlan", { themeId, plan });
        if (!result || result.status !== "ok") throw new Error(result && result.message || t("saveFail"));
        if (seq === saveSeq && visible && data.theme.id === themeId && !reloadAfterSave) {
          data.actionManagement.plan = plan;
          dirty = false;
          notice = t("saved");
        }
      } catch (error) {
        if (seq === saveSeq) notice = `${t("saveFail")}: ${error.message}`;
      } finally {
        busy = false;
        if (reloadAfterSave) {
          reloadAfterSave = false;
          await load();
        } else render();
      }
    }
    if (typeof api.onChanged === "function") api.onChanged((payload) => {
      if (!visible) return;
      const changed = payload && payload.changes || {};
      if (busy) {
        if (Object.prototype.hasOwnProperty.call(changed, "theme") || Object.prototype.hasOwnProperty.call(changed, "themeVariant")) reloadAfterSave = true;
        return;
      }
      if (Object.prototype.hasOwnProperty.call(changed, "theme") || Object.prototype.hasOwnProperty.call(changed, "themeVariant")) void load();
      else if (!dirty && Object.prototype.hasOwnProperty.call(changed, "themeOverrides")) void load();
    });
    return { enter() {
      visible = true;
      return load();
    }, leave() {
      visible = false;
      seq++;
      clearPreviews();
      dragged = null;
    }, refresh: load, render };
  }
  root.MobiDashboardActions = { create };
})(globalThis);
