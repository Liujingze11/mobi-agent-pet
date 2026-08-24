"use strict";

const assert = require("node:assert");
const { describe, it } = require("node:test");

const { createTrayMenuModel } = require("../src/tray-menu-model");

const EXPECTED_COMMAND_IDS = [
  "mode.normal",
  "mode.background",
  "mode.automatic",
  "agentlog.open",
  "dashboard.open",
  "pet.primary-display",
  "startup.toggle",
  "settings.open",
  "settings.agents",
  "updates.action",
  "pet.toggle",
  "app.quit",
];

function createContext(overrides = {}) {
  return {
    getAppMode: () => "automatic",
    getMiniMode: () => false,
    getMiniTransitioning: () => false,
    hasBringPetToPrimaryDisplay: true,
    petHidden: false,
    openAtLogin: false,
    requestAppMode: () => {},
    openAgentLogManager: () => {},
    openDashboard: () => {},
    bringPetToPrimaryDisplay: () => {},
    openSettingsWindow: () => {},
    openSettingsTab: () => {},
    getUpdateMenuItem: () => ({ label: "Install update", enabled: true, click: () => {} }),
    togglePetVisibility: () => {},
    requestAppQuit: () => {},
    ...overrides,
  };
}

function flatten(items) {
  return items.flatMap((item) => [item, ...(item.items ? flatten(item.items) : [])]);
}

describe("tray menu model", () => {
  it("builds the serializable quick menu with stable commands", () => {
    const labels = {
      appMode: "Mode",
      appModeNormal: "Normal",
      appModeBackground: "Background",
      appModeAutomatic: "Automatic",
      appModeCustom: "Custom",
      appModeEditCustom: "Edit custom...",
      openAgentLog: "Open AgentLog",
      openDashboard: "Open Dashboard",
      bringPetToPrimaryDisplay: "Bring pet to primary display",
      startOnLogin: "Start on login",
      settings: "Settings",
      openAgentIntegrations: "Agent integrations",
      hidePet: "Hide Pet",
      showPet: "Show Pet",
      quit: "Quit",
    };
    const { items, commands } = createTrayMenuModel(createContext(), (key) => labels[key]);
    const flattened = flatten(items);

    assert.deepStrictEqual(
      flattened.filter((item) => item.id).map((item) => item.id),
      EXPECTED_COMMAND_IDS
    );
    assert.ok(flattened.filter((item) => item.kind === "separator").every((item) => !item.id));
    assert.deepStrictEqual(
      flattened.filter((item) => item.id && item.id.startsWith("mode.")).map((item) => item.kind),
      ["radio", "radio", "radio"]
    );
    assert.ok(flattened.every((item) => (
      Object.keys(item).every((key) => ["id", "kind", "label", "enabled", "checked", "items"].includes(key))
    )));
    const customMode = flattened.find((item) => item.label === "Custom");
    const editCustomMode = flattened.find((item) => item.label === "Edit custom...");
    assert.strictEqual(customMode.enabled, false);
    assert.strictEqual(editCustomMode.enabled, false);
    assert.doesNotThrow(() => JSON.stringify(items));
    assert.strictEqual(commands.has("mode.automatic"), true);
  });

  it("routes known actions once and rejects unknown commands", () => {
    const calls = [];
    const update = { label: "Install update", click: () => calls.push("update") };
    const ctx = createContext({
      requestAppMode: (mode) => calls.push(mode),
      getUpdateMenuItem: () => update,
      requestAppQuit: () => calls.push("quit"),
    });
    const { commands } = createTrayMenuModel(ctx, (key) => key);

    assert.strictEqual(commands.execute("mode.automatic"), true);
    assert.strictEqual(commands.execute("startup.toggle"), true);
    assert.strictEqual(commands.execute("updates.action"), true);
    assert.strictEqual(commands.execute("app.quit"), true);
    assert.strictEqual(commands.execute("unknown"), false);
    assert.deepStrictEqual(calls, ["automatic", "update", "quit"]);
    assert.strictEqual(ctx.openAtLogin, true);
  });

  it("disables the primary-display action when the parent action is unavailable", () => {
    const { items } = createTrayMenuModel(
      createContext({ hasBringPetToPrimaryDisplay: false }),
      (key) => key
    );

    assert.strictEqual(
      flatten(items).find((item) => item.id === "pet.primary-display").enabled,
      false
    );
  });
});
