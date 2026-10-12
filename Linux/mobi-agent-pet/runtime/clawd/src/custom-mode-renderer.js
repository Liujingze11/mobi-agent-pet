"use strict";

const core = globalThis.ClawdSettingsCore;
const content = document.getElementById("content");
core.state.activeTab = "custom-mode";
core.state.snapshot = { lang: "en" };
globalThis.MobiCustomModeEditor.init(core);
core.ops.installRenderHooks({
  content() {
    content.replaceChildren();
    core.tabs["custom-mode"].render(content);
    document.documentElement.lang = core.state.snapshot.lang;
    document.title = core.helpers.t("sidebarCustomMode");
  },
});
window.settingsAPI.onChanged((payload) => core.ops.applyChanges(payload));
core.ops.requestRender({ content: true });
