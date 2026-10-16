"use strict";

(function initSettingsTabTheme(root) {
  const PREVIEW_TARGET_CONTENT_RATIO = 0.55;

  let state = null;
  let runtime = null;
  let helpers = null;
  let ops = null;
  let readers = null;
  let customizingThemeId = null;
  let customizationSelectionPendingThemeId = null;
  let customizationSelectionSeq = 0;

  function themeApi() {
    return root.petThemeAPI || root.settingsAPI;
  }

  function t(key) {
    return helpers.t(key);
  }

  function render(parent) {
    const detailTheme = Array.isArray(runtime.themeList)
      ? runtime.themeList.find((theme) => (
        theme
        && theme.id === customizingThemeId
        && theme.active
        && supportsThemeCustomization(theme)
      ))
      : null;
    if (detailTheme) {
      renderThemeDetail(parent, detailTheme);
      return;
    }
    customizingThemeId = null;

    const h1 = document.createElement("h1");
    h1.textContent = t("themeTitle");
    const heading = document.createElement("header");
    heading.className = "dashboard-page-heading";
    heading.appendChild(h1);
    parent.appendChild(heading);

    if (runtime.themeList === null) {
      const loading = document.createElement("div");
      loading.className = "placeholder-desc";
      parent.appendChild(loading);
      ops.fetchThemes().then(() => {
        if (state.activeTab === "theme") ops.requestRender({ content: true });
      });
      return;
    }

    if (runtime.themeList.length === 0) {
      const empty = document.createElement("div");
      empty.className = "placeholder";
      empty.innerHTML = `<div class="placeholder-desc">${helpers.escapeHtml(t("themeEmpty"))}</div>`;
      parent.appendChild(empty);
      return;
    }

    for (const section of getThemeSections(runtime.themeList)) {
      const sectionEl = document.createElement("section");
      sectionEl.className = "theme-section";
      if (section.title) {
        sectionEl.setAttribute("aria-labelledby", `theme-section-${section.id}`);
        const title = document.createElement("h2");
        title.id = `theme-section-${section.id}`;
        title.className = "theme-section-title";
        title.textContent = section.title;
        sectionEl.appendChild(title);
      }

      const grid = document.createElement("div");
      grid.className = "theme-grid";
      for (const theme of section.themes) {
        grid.appendChild(buildThemeCard(theme));
      }
      sectionEl.appendChild(grid);
      parent.appendChild(sectionEl);
    }
  }

  function getThemeSections(themes) {
    const groups = {
      builtin: [],
      user: [],
    };
    for (const theme of themes || []) {
      if (theme && theme.builtin) groups.builtin.push(theme);
      else groups.user.push(theme);
    }
    return [
      { id: "builtin", title: null, themes: groups.builtin },
      { id: "user", title: t("themeGroupUserThemes"), themes: groups.user },
    ].filter((section) => section.themes.length > 0);
  }

  function localizeField(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      const lang = readers.getLang();
      if (value[lang]) return value[lang];
      if (value.en) return value.en;
      if (value.zh) return value.zh;
      const firstKey = Object.keys(value)[0];
      if (firstKey) return value[firstKey];
    }
    return "";
  }

  function applyThemePreviewScale(el, contentRatio) {
    if (!Number.isFinite(contentRatio) || contentRatio <= 0) return;
    if (contentRatio <= PREVIEW_TARGET_CONTENT_RATIO) return;
    const scale = PREVIEW_TARGET_CONTENT_RATIO / contentRatio;
    const pct = `${(scale * 100).toFixed(2)}%`;
    el.style.maxWidth = pct;
    el.style.maxHeight = pct;
  }

  function applyThemePreviewOffset(el, offsetPct) {
    if (!offsetPct) return;
    const { x, y } = offsetPct;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return;
    el.style.transform = `translate(${x.toFixed(2)}%, ${y.toFixed(2)}%)`;
  }


  function buildThemePreviewMedia(theme) {
    const img = document.createElement("img");
    img.src = theme.previewFileUrl;
    img.alt = "";
    img.draggable = false;
    applyThemePreviewScale(img, theme.previewContentRatio);
    applyThemePreviewOffset(img, theme.previewContentOffsetPct);
    return img;
  }

  function getThemeCapabilityBadgeLabels(theme) {
    const caps = theme && theme.capabilities;
    if (!caps || typeof caps !== "object") return [];
    const badges = [];
    if (caps.idleMode === "animated") badges.push(t("themeCapabilityAnimated"));
    else if (caps.idleMode === "static") badges.push(t("themeCapabilityStatic"));
    if (caps.sleepMode === "direct") badges.push(t("themeCapabilityDirectSleep"));
    if (caps.powerProfile === "scripted") badges.push(t("themeCapabilityFineMotion"));
    if (caps.reactions === false) badges.push(t("themeCapabilityNoReactions"));
    return badges;
  }

  function supportsThemeCustomization(theme) {
    const caps = theme && theme.capabilities;
    return !!(caps && (caps.petTint === true || caps.accessories === true));
  }

  function mirrorThemeSelectionResult(themeId, result) {
    if (!Array.isArray(runtime.themeList)) return null;
    const runtimeCapabilities = (
      result
      && result.customizationCapabilities
      && typeof result.customizationCapabilities === "object"
      && !Array.isArray(result.customizationCapabilities)
    )
      ? result.customizationCapabilities
      : null;
    runtime.themeList = runtime.themeList.map((entry) => (
      entry
        ? {
            ...entry,
            active: entry.id === themeId,
            capabilities: entry.id === themeId && runtimeCapabilities
              ? { ...(entry.capabilities || {}), ...runtimeCapabilities }
              : entry.capabilities,
          }
        : entry
    ));
    return runtime.themeList.find((entry) => entry && entry.id === themeId) || null;
  }

  function openThemeCustomization(theme) {
    if (!theme || !supportsThemeCustomization(theme)) return;
    if (theme.active) {
      customizingThemeId = theme.id;
      ops.requestRender({ content: true });
      return;
    }
    if (customizationSelectionPendingThemeId) return;

    const requestSeq = ++customizationSelectionSeq;
    customizationSelectionPendingThemeId = theme.id;
    ops.requestRender({ content: true });
    Promise.resolve(themeApi().command("setThemeSelection", { themeId: theme.id }))
      .then((result) => {
        if (requestSeq !== customizationSelectionSeq) return;
        if (!result || result.status !== "ok") {
          const message = (result && result.message) || "unknown error";
          ops.showToast(t("toastSaveFailed") + message, { error: true });
          return;
        }
        // The controller has already activated and committed this theme before
        // returning ok. Mirror that acknowledged result into the renderer's
        // metadata cache so opening the detail does not depend on a second IPC
        // fetch that can fail independently.
        const activeEntry = mirrorThemeSelectionResult(theme.id, result);
        customizingThemeId = supportsThemeCustomization(activeEntry) ? theme.id : null;
      })
      .catch((err) => {
        if (requestSeq !== customizationSelectionSeq) return;
        const message = (err && err.message) || "unknown error";
        ops.showToast(t("toastSaveFailed") + message, { error: true });
      })
      .finally(() => {
        if (requestSeq !== customizationSelectionSeq) return;
        customizationSelectionPendingThemeId = null;
        if (state.activeTab === "theme") ops.requestRender({ content: true });
      });
  }

  function closeThemeCustomization() {
    customizingThemeId = null;
    ops.requestRender({ content: true });
  }

  function renderThemeDetail(parent, theme) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "theme-detail-back";
    back.textContent = `\u2039 ${t("themeBackToPets")}`;
    back.addEventListener("click", closeThemeCustomization);
    parent.appendChild(back);

    const hero = document.createElement("div");
    hero.className = "theme-detail-hero";
    const preview = document.createElement("div");
    preview.className = "theme-thumb theme-detail-preview";
    if (theme.previewFileUrl) {
      preview.appendChild(buildThemePreviewMedia(theme));
    } else {
      const glyph = document.createElement("span");
      glyph.className = "theme-thumb-empty";
      glyph.textContent = t("themeThumbMissing");
      preview.appendChild(glyph);
    }
    hero.appendChild(preview);

    const heading = document.createElement("div");
    heading.className = "theme-detail-heading";
    const h1 = document.createElement("h1");
    h1.textContent = localizeField(theme.name) || theme.id;
    heading.appendChild(h1);
    const current = document.createElement("div");
    current.className = "theme-detail-current";
    current.textContent = t("themeActiveIndicator");
    heading.appendChild(current);
    hero.appendChild(heading);
    parent.appendChild(hero);

    const section = document.createElement("section");
    section.className = "section theme-detail-section";
    const title = document.createElement("h2");
    title.textContent = t("themeAppearanceTitle");
    section.appendChild(title);
    const caps = theme.capabilities || {};
    if (caps.petTint === true) section.appendChild(buildThemeTintRow(theme));
    if (caps.accessories === true) section.appendChild(buildThemeAccessoryRow(theme));
    parent.appendChild(section);
  }

  function getTintOptions() {
    return Array.isArray(runtime.petTintOptions)
      ? runtime.petTintOptions.filter((entry) => (
        entry
        && typeof entry.id === "string"
        && /^[a-z][a-z0-9-]{0,31}$/.test(entry.id)
        && typeof entry.labelKey === "string"
        && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(entry.labelKey)
      ))
      : [];
  }

  function getThemeTintId(themeId, options) {
    const selections = state.snapshot && state.snapshot.petTint;
    const value = typeof selections === "string"
      ? selections
      : (selections && typeof selections === "object" ? selections[themeId] : null);
    return options.some((entry) => entry.id === value) ? value : "none";
  }

  function getAccessoryOptions() {
    return Array.isArray(runtime.petAccessoryOptions)
      ? runtime.petAccessoryOptions.filter((entry) => (
        entry
        && typeof entry.id === "string"
        && /^[a-z][a-z0-9-]{0,31}$/.test(entry.id)
        && typeof entry.labelKey === "string"
        && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(entry.labelKey)
      ))
      : [];
  }

  function getThemeAccessoryId(themeId, options) {
    const selections = state.snapshot && state.snapshot.petAccessory;
    const value = selections && typeof selections === "object" && !Array.isArray(selections)
      ? selections[themeId]
      : null;
    return options.some((entry) => entry.id === value) ? value : "none";
  }

  function buildThemeTintRow(theme) {
    const row = document.createElement("div");
    row.className = "row theme-customization-row";

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("rowPetColor");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = t("themePetColorDesc");
    text.appendChild(label);
    text.appendChild(desc);

    const control = document.createElement("div");
    control.className = "row-control";
    const select = document.createElement("select");
    select.className = "pet-tint-select";
    select.setAttribute("aria-label", t("rowPetColor"));
    const options = getTintOptions();
    for (const entry of options) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = t(entry.labelKey);
      select.appendChild(option);
    }
    if (options.length === 0) {
      const option = document.createElement("option");
      option.value = "none";
      option.textContent = t("tintNone");
      select.appendChild(option);
      select.disabled = true;
    }

    function syncFromSnapshot() {
      select.value = getThemeTintId(theme.id, options);
      select.classList.remove("pending");
      select.disabled = options.length === 0;
    }

    select.addEventListener("change", () => {
      if (select.disabled || select.classList.contains("pending")) return;
      const next = select.value;
      const committed = getThemeTintId(theme.id, options);
      if (next === committed) return;
      const current = state.snapshot && state.snapshot.petTint;
      const nextMap = current && typeof current === "object" && !Array.isArray(current)
        ? { ...current }
        : {};
      if (next === "none") delete nextMap[theme.id];
      else nextMap[theme.id] = next;
      select.classList.add("pending");
      select.disabled = true;
      Promise.resolve(themeApi().update("petTint", nextMap))
        .then((result) => {
          if (result && result.status === "ok") {
            state.snapshot = { ...(state.snapshot || {}), petTint: nextMap };
            return;
          }
          const message = (result && result.message) || "unknown error";
          ops.showToast(t("toastSaveFailed") + message, { error: true });
          syncFromSnapshot();
        })
        .catch((err) => {
          const message = (err && err.message) || "unknown error";
          ops.showToast(t("toastSaveFailed") + message, { error: true });
          syncFromSnapshot();
        })
        .finally(() => {
          if (document.body.contains(select)) {
            select.classList.remove("pending");
            select.disabled = options.length === 0;
          }
        });
    });

    control.appendChild(select);
    row.appendChild(text);
    row.appendChild(control);
    syncFromSnapshot();
    return row;
  }

  function buildThemeAccessoryRow(theme) {
    const row = document.createElement("div");
    row.className = "row theme-customization-row";

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t("rowPetAccessory");
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = t("themePetAccessoryDesc");
    text.appendChild(label);
    text.appendChild(desc);

    const control = document.createElement("div");
    control.className = "row-control";
    const select = document.createElement("select");
    select.className = "pet-accessory-select";
    select.setAttribute("aria-label", t("rowPetAccessory"));
    const options = getAccessoryOptions();
    for (const entry of options) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = t(entry.labelKey);
      select.appendChild(option);
    }
    if (options.length === 0) {
      const option = document.createElement("option");
      option.value = "none";
      option.textContent = t("accessoryNone");
      select.appendChild(option);
      select.disabled = true;
    }

    function syncFromSnapshot() {
      select.value = getThemeAccessoryId(theme.id, options);
      select.classList.remove("pending");
      select.disabled = options.length === 0;
    }

    select.addEventListener("change", () => {
      if (select.disabled || select.classList.contains("pending")) return;
      const next = select.value;
      const committed = getThemeAccessoryId(theme.id, options);
      if (next === committed) return;
      const current = state.snapshot && state.snapshot.petAccessory;
      const nextMap = current && typeof current === "object" && !Array.isArray(current)
        ? { ...current }
        : {};
      if (next === "none") delete nextMap[theme.id];
      else nextMap[theme.id] = next;
      select.classList.add("pending");
      select.disabled = true;
      Promise.resolve(themeApi().update("petAccessory", nextMap))
        .then((result) => {
          if (result && result.status === "ok") {
            state.snapshot = { ...(state.snapshot || {}), petAccessory: nextMap };
            return;
          }
          const message = (result && result.message) || "unknown error";
          ops.showToast(t("toastSaveFailed") + message, { error: true });
          syncFromSnapshot();
        })
        .catch((err) => {
          const message = (err && err.message) || "unknown error";
          ops.showToast(t("toastSaveFailed") + message, { error: true });
          syncFromSnapshot();
        })
        .finally(() => {
          if (document.body.contains(select)) {
            select.classList.remove("pending");
            select.disabled = options.length === 0;
          }
        });
    });

    control.appendChild(select);
    row.appendChild(text);
    row.appendChild(control);
    syncFromSnapshot();
    return row;
  }


  function stopThemeCardButtonKeydown(ev) {
    ev.stopPropagation();
  }

  function buildThemeCard(theme) {
    const card = document.createElement("div");
    card.className = "theme-card";
    card.setAttribute("role", "radio");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-checked", theme.active ? "true" : "false");
    if (theme.active) card.classList.add("active");

    const thumb = document.createElement("div");
    thumb.className = "theme-thumb";
    if (theme.previewFileUrl) {
      thumb.appendChild(buildThemePreviewMedia(theme));
    } else {
      const glyph = document.createElement("span");
      glyph.className = "theme-thumb-empty";
      glyph.textContent = t("themeThumbMissing");
      thumb.appendChild(glyph);
    }
    card.appendChild(thumb);

    const name = document.createElement("div");
    name.className = "theme-card-name";
    const nameText = document.createElement("span");
    nameText.className = "theme-card-name-text";
    nameText.textContent = localizeField(theme.name) || theme.id;
    name.appendChild(nameText);
    const indicator = document.createElement("span");
    indicator.className = "theme-card-check";
    indicator.textContent = theme.active ? t("themeActiveIndicator") : "";
    if (!theme.active) indicator.setAttribute("aria-hidden", "true");
    name.appendChild(indicator);
    card.appendChild(name);

    const descriptionText = localizeField(theme.description).trim();
    if (descriptionText) {
      const description = document.createElement("p");
      description.className = "theme-card-description";
      description.textContent = descriptionText;
      card.appendChild(description);
    }

    const capLabels = getThemeCapabilityBadgeLabels(theme);
    if (capLabels.length) {
      const caps = document.createElement("div");
      caps.className = "theme-card-capabilities";
      for (const label of capLabels) {
        const badge = document.createElement("span");
        badge.className = "theme-card-badge";
        badge.textContent = label;
        caps.appendChild(badge);
      }
      card.appendChild(caps);
    }

    const canDelete = !theme.builtin && !theme.active;
    const footer = document.createElement("div");
    footer.className = "theme-card-footer";
    if (supportsThemeCustomization(theme)) {
      const btn = document.createElement("button");
      btn.className = "theme-customize-btn";
      btn.type = "button";
      btn.textContent = `${t("themeCustomize")} \u203a`;
      btn.setAttribute("aria-label", `${t("themeCustomize")}: ${localizeField(theme.name) || theme.id}`);
      btn.disabled = !!customizationSelectionPendingThemeId;
      if (customizationSelectionPendingThemeId === theme.id) btn.classList.add("pending");
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openThemeCustomization(theme);
      });
      btn.addEventListener("keydown", stopThemeCardButtonKeydown);
      footer.appendChild(btn);
    }
    if (canDelete) {
      const btn = document.createElement("button");
      btn.className = "theme-delete-btn";
      btn.type = "button";
      btn.textContent = "\u{1F5D1}";
      btn.title = t("themeDeleteLabel");
      btn.setAttribute("aria-label", t("themeDeleteLabel"));
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        handleDeleteTheme(theme);
      });
      btn.addEventListener("keydown", stopThemeCardButtonKeydown);
      footer.appendChild(btn);
    }
    if (footer.children.length) card.appendChild(footer);

    if (!theme.active) {
      helpers.attachActivation(card, () => (
        Promise.resolve(themeApi().command("setThemeSelection", { themeId: theme.id }))
          .then((result) => {
            if (result && result.status === "ok") {
              mirrorThemeSelectionResult(theme.id, result);
              if (state.activeTab === "theme") ops.requestRender({ content: true });
            }
            return result;
          })
      ));
    }
    return card;
  }


  function handleDeleteTheme(theme) {
    if (!themeApi()) return;
    themeApi()
      .confirmRemoveTheme(theme.id)
      .then((res) => {
        if (!res || !res.confirmed) return null;
        return themeApi().command("removeTheme", theme.id);
      })
      .then((result) => {
        if (result == null) return;
        if (result.status !== "ok") {
          const msg = (result && result.message) || "unknown error";
          ops.showToast(t("toastThemeDeleteFailed") + msg, { error: true });
          return;
        }
        ops.showToast(t("toastThemeDeleted"));
        ops.fetchThemes().then(() => {
          if (state.activeTab === "theme") ops.requestRender({ content: true });
        });
      })
      .catch((err) => {
        ops.showToast(t("toastThemeDeleteFailed") + (err && err.message), { error: true });
      });
  }

  function init(core) {
    state = core.state;
    runtime = core.runtime;
    helpers = core.helpers;
    ops = core.ops;
    readers = core.readers;
    core.tabs.theme = {
      render,
      onExit() {
        customizationSelectionSeq += 1;
        customizingThemeId = null;
        customizationSelectionPendingThemeId = null;
      },
    };
  }

  root.ClawdSettingsTabTheme = { init };
})(globalThis);
