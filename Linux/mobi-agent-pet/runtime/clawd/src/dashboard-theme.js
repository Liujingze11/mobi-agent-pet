"use strict";

(function initDashboardTheme(root) {
  function create({ container, getLang }) {
    const state = { activeTab: null, snapshot: {} };
    const runtime = {
      themeList: null,
      petTintOptions: [],
      petAccessoryOptions: [],
      codexPetsRefreshPending: false,
      codexPetZipImportPending: false,
      userThemeZipImportPending: false,
      codexPetRemovalPendingThemeId: null,
    };
    const tabs = {};

    function t(key) {
      const strings = root.ClawdSettingsI18n && root.ClawdSettingsI18n.STRINGS;
      const dict = strings && (strings[getLang()] || strings.en);
      return (dict && dict[key]) || key;
    }

    function showToast(message, options = {}) {
      const toast = document.createElement("div");
      toast.className = `dashboard-theme-toast${options.error ? " error" : ""}`;
      toast.textContent = message;
      document.getElementById("dashboardThemeToasts").appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }

    function attachActivation(element, invoke) {
      const run = async () => {
        if (element.classList.contains("pending")) return;
        element.classList.add("pending");
        try {
          const result = await invoke();
          if (!result || result.status !== "ok") {
            showToast(`${t("toastSaveFailed")}${(result && result.message) || "unknown error"}`, { error: true });
          }
        } catch (error) {
          showToast(`${t("toastSaveFailed")}${error.message}`, { error: true });
        } finally {
          element.classList.remove("pending");
        }
      };
      element.addEventListener("click", run);
      element.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        void run();
      });
    }

    const core = {
      state, runtime, tabs,
      helpers: {
        t,
        escapeHtml: (value) => String(value).replace(/[&<>"']/g, (char) => ({
          "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        }[char])),
        attachActivation,
      },
      readers: { getLang },
      ops: {
        requestRender: ({ content } = {}) => { if (content && state.activeTab === "theme") render(); },
        showToast,
        fetchThemes: async () => {
          const list = await root.petThemeAPI.listThemes();
          runtime.themeList = Array.isArray(list) ? list : [];
          return runtime.themeList;
        },
      },
    };
    root.ClawdSettingsTabTheme.init(core);

    function render() {
      if (state.activeTab !== "theme") return;
      container.replaceChildren();
      tabs.theme.render(container);
    }

    async function refresh() {
      const [snapshot, tintOptions, accessoryOptions, themes] = await Promise.all([
        root.petThemeAPI.getSnapshot(),
        root.petThemeAPI.getPetTintOptions(),
        root.petThemeAPI.getPetAccessoryOptions(),
        root.petThemeAPI.listThemes(),
      ]);
      state.snapshot = snapshot || {};
      runtime.petTintOptions = Array.isArray(tintOptions) ? tintOptions : [];
      runtime.petAccessoryOptions = Array.isArray(accessoryOptions) ? accessoryOptions : [];
      runtime.themeList = Array.isArray(themes) ? themes : [];
      render();
    }

    function enter() {
      state.activeTab = "theme";
      return refresh().catch((error) => showToast(`${t("toastSaveFailed")}${error.message}`, { error: true }));
    }

    function leave() {
      state.activeTab = null;
      tabs.theme.onExit();
    }

    return { enter, leave, refresh, render, t };
  }

  root.ClawdDashboardTheme = { create };
})(globalThis);
