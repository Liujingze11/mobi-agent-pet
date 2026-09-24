"use strict";

const KIND = Object.freeze({
  command: "command",
  checkbox: "checkbox",
  radio: "radio",
  separator: "separator",
  submenu: "submenu",
});

function joinGroups(groups) {
  const items = [];
  for (const group of groups) {
    if (!group || group.length === 0) continue;
    if (items.length > 0) items.push({ kind: KIND.separator });
    items.push(...group);
  }
  return items;
}

function createCommandRouter(entries) {
  const handlers = new Map(entries);
  return Object.freeze({
    has: (id) => handlers.has(id),
    execute(id) {
      const handler = handlers.get(id);
      if (!handler) return false;
      handler();
      return true;
    },
  });
}

function buildItems(ctx, t) {
  const currentMode = ctx.getAppMode();
  const stateGroup = [{
    kind: KIND.submenu,
    label: t("appMode"),
    items: [
      { id: "mode.normal", kind: KIND.radio, label: t("appModeNormal"), checked: currentMode === "normal" },
      { id: "mode.background", kind: KIND.radio, label: t("appModeBackground"), checked: currentMode === "background" },
      { id: "mode.automatic", kind: KIND.radio, label: t("appModeAutomatic"), checked: currentMode === "automatic" },
      { kind: KIND.radio, label: t("appModeCustom"), enabled: false, checked: false },
      { kind: KIND.separator },
      { kind: KIND.command, label: t("appModeEditCustom"), enabled: false },
    ],
  }];
  const workGroup = [
    { id: "dashboard.open", kind: KIND.command, label: t("openDashboard") },
    { id: "agentlog.open", kind: KIND.command, label: t("openAgentLog") },
  ];
  const systemGroup = [];
  if (ctx.platform === "darwin") {
    systemGroup.push(
      {
        id: "tray.visibility",
        kind: KIND.checkbox,
        label: t("showInMenuBar"),
        checked: ctx.showTray === true,
        enabled: ctx.showTray ? ctx.showDock : true,
      },
      {
        id: "dock.visibility",
        kind: KIND.checkbox,
        label: t("showInDock"),
        checked: ctx.showDock === true,
        enabled: ctx.showDock ? ctx.showTray : true,
      },
    );
  }
  const appGroup = [
    { id: "settings.open", kind: KIND.command, label: t("settings") },
  ];

  return joinGroups([
    stateGroup,
    workGroup,
    systemGroup,
    appGroup,
    [{ id: "app.quit", kind: KIND.command, label: t("quit") }],
  ]);
}

function createTrayMenuModel(ctx, t) {
  const entries = [
    ["mode.normal", () => ctx.requestAppMode("normal")],
    ["mode.background", () => ctx.requestAppMode("background")],
    ["mode.automatic", () => ctx.requestAppMode("automatic")],
    ["agentlog.open", () => ctx.openAgentLogManager()],
    ["dashboard.open", () => ctx.openDashboard()],
    ["tray.visibility", () => { ctx.showTray = !ctx.showTray; }],
    ["dock.visibility", () => { ctx.showDock = !ctx.showDock; }],
    ["settings.open", () => ctx.openSettingsWindow()],
    ["app.quit", () => ctx.requestAppQuit()],
  ];
  return { items: buildItems(ctx, t), commands: createCommandRouter(entries) };
}

module.exports = { createCommandRouter, createTrayMenuModel };
