"use strict";

const KIND = Object.freeze({
  item: "item",
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

function buildItems(ctx, t, update) {
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
      { kind: KIND.item, label: t("appModeEditCustom"), enabled: false },
    ],
  }];
  const workGroup = [
    { id: "agentlog.open", kind: KIND.item, label: t("openAgentLog") },
    { id: "dashboard.open", kind: KIND.item, label: t("openDashboard") },
  ];
  const systemGroup = [
    {
      id: "pet.primary-display",
      kind: KIND.item,
      label: t("bringPetToPrimaryDisplay"),
      enabled: ctx.hasBringPetToPrimaryDisplay === true
        && !ctx.getMiniMode()
        && !ctx.getMiniTransitioning(),
    },
    {
      id: "startup.toggle",
      kind: KIND.checkbox,
      label: t("startOnLogin"),
      checked: ctx.openAtLogin === true,
    },
  ];
  const appGroup = [
    { id: "settings.open", kind: KIND.item, label: t("settings") },
    { id: "settings.agents", kind: KIND.item, label: t("openAgentIntegrations") },
  ];
  if (update) {
    appGroup.push({
      id: "updates.action",
      kind: KIND.item,
      label: update.label,
      enabled: update.enabled !== false,
    });
  }
  appGroup.push({
    id: "pet.toggle",
    kind: KIND.item,
    label: ctx.petHidden ? t("showPet") : t("hidePet"),
  });

  return joinGroups([
    stateGroup,
    workGroup,
    systemGroup,
    appGroup,
    [{ id: "app.quit", kind: KIND.item, label: t("quit") }],
  ]);
}

function createTrayMenuModel(ctx, t) {
  const update = typeof ctx.getUpdateMenuItem === "function"
    ? ctx.getUpdateMenuItem()
    : null;
  const entries = [
    ["mode.normal", () => ctx.requestAppMode("normal")],
    ["mode.background", () => ctx.requestAppMode("background")],
    ["mode.automatic", () => ctx.requestAppMode("automatic")],
    ["agentlog.open", () => ctx.openAgentLogManager()],
    ["dashboard.open", () => ctx.openDashboard()],
    ["pet.primary-display", () => ctx.bringPetToPrimaryDisplay()],
    ["startup.toggle", () => { ctx.openAtLogin = !ctx.openAtLogin; }],
    ["settings.open", () => ctx.openSettingsWindow()],
    ["settings.agents", () => ctx.openSettingsTab("agents")],
    ["updates.action", () => { if (update && update.click) update.click(); }],
    ["pet.toggle", () => ctx.togglePetVisibility()],
    ["app.quit", () => ctx.requestAppQuit()],
  ];
  return { items: buildItems(ctx, t, update), commands: createCommandRouter(entries) };
}

module.exports = { createCommandRouter, createTrayMenuModel };
