"use strict";

(function initDashboardAnimation(root) {
  function create({ container }) {
    const core = root.ClawdSettingsCore;
    if (!core || !root.ClawdSettingsTabAnimOverrides) {
      throw new Error("pet sound editor failed to load");
    }
    core.state.activeTab = "dashboard-hidden";
    core.runtime.petBehaviorSoundOnly = true;
    core.runtime.animOverridesSubtab = "sounds";
    root.ClawdSettingsTabAnimOverrides.init(core);
    let enterSeq = 0;

    core.ops.installRenderHooks({
      content: () => {
        if (core.state.activeTab !== "animOverrides") return;
        core.ops.clearMountedControls();
        container.replaceChildren();
        core.tabs.animOverrides.render(container);
      },
    });

    if (typeof root.settingsAPI.onChanged === "function") {
      root.settingsAPI.onChanged((payload) => core.ops.applyChanges(payload));
    }
    if (typeof root.settingsAPI.onAnimationPreviewPosterReady === "function") {
      root.settingsAPI.onAnimationPreviewPosterReady((payload) => core.ops.applyAnimationPreviewPoster(payload));
    }

    async function enter() {
      const seq = ++enterSeq;
      const snapshot = await root.settingsAPI.getSnapshot();
      if (seq !== enterSeq) return;
      core.state.snapshot = snapshot || {};
      core.runtime.animationOverridesData = null;
      core.ops.selectTab("animOverrides");
    }

    function leave() {
      enterSeq += 1;
      core.ops.selectTab("dashboard-hidden");
      core.ops.clearMountedControls();
    }

    function refreshLanguage() {
      if (core.state.activeTab === "animOverrides") core.ops.requestRender({ content: true, modal: true });
    }

    return { enter, leave, refreshLanguage };
  }

  root.ClawdDashboardAnimation = { create, navigateTheme: null };
})(globalThis);
