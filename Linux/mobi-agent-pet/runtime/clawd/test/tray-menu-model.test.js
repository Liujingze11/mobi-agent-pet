"use strict";

const assert = require("node:assert");
const { describe, it } = require("node:test");

const { createTrayMenuModel } = require("../src/tray-menu-model");
const { validateParentMessage } = require("../src/linux-tray-protocol");

const EXPECTED_COMMAND_IDS = [
  "mode.normal",
  "mode.background",
  "mode.automatic",
  "dashboard.open",
  "agentlog.open",
  "settings.open",
  "app.quit",
];

function createContext(overrides = {}) {
  return {
    getAppMode: () => "automatic",
    getMiniMode: () => false,
    getMiniTransitioning: () => false,
    petHidden: false,
    openAtLogin: false,
    requestAppMode: () => {},
    openAgentLogManager: () => {},
    openDashboard: () => {},
    openSettingsWindow: () => {},
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
      settings: "Settings",
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

  it("produces a complete menu accepted by the native tray protocol", () => {
    const iconThemeRoot = "/opt/agentlog/tray/icons";
    const { items } = createTrayMenuModel(createContext(), (key) => key);

    const init = validateParentMessage({
      version: 1,
      type: "init",
      revision: 0,
      productId: "com.agentlog.pet",
      tooltip: "AgentLog Pet",
      iconThemeRoot,
      icon: "agentlog-pet",
      items,
    }, { expectedIconThemeRoot: iconThemeRoot });

    assert.deepStrictEqual(init.items, items);
  });

  it("routes known actions once and rejects unknown commands", () => {
    const calls = [];
    const ctx = createContext({
      requestAppMode: (mode) => calls.push(mode),
      openSettingsWindow: () => calls.push("settings"),
      requestAppQuit: () => calls.push("quit"),
    });
    const { commands } = createTrayMenuModel(ctx, (key) => key);

    assert.strictEqual(commands.execute("mode.automatic"), true);
    assert.strictEqual(commands.execute("settings.open"), true);
    assert.strictEqual(commands.execute("updates.action"), false);
    assert.strictEqual(commands.execute("app.quit"), true);
    assert.strictEqual(commands.execute("unknown"), false);
    assert.deepStrictEqual(calls, ["automatic", "settings", "quit"]);
    assert.strictEqual(ctx.openAtLogin, false);
  });

  it("omits pet visibility and login startup from the tray menu", () => {
    const { items, commands } = createTrayMenuModel(createContext(), (key) => key);
    for (const id of ["pet.toggle", "startup.toggle"]) {
      assert.strictEqual(flatten(items).some((item) => item.id === id), false);
      assert.strictEqual(commands.has(id), false);
      assert.strictEqual(commands.execute(id), false);
    }
    assert.strictEqual(commands.has("settings.open"), true);
  });

  it("does not expose the retired primary-display command", () => {
    const { items, commands } = createTrayMenuModel(createContext(), (key) => key);

    assert.strictEqual(flatten(items).some((item) => item.id === "pet.primary-display"), false);
    assert.strictEqual(commands.has("pet.primary-display"), false);
    assert.strictEqual(commands.execute("pet.primary-display"), false);
  });

  it("does not expose the redundant Agent settings shortcut", () => {
    const { items, commands } = createTrayMenuModel(createContext(), (key) => key);

    assert.strictEqual(flatten(items).some((item) => item.id === "settings.agents"), false);
    assert.strictEqual(commands.has("settings.agents"), false);
    assert.strictEqual(commands.execute("settings.agents"), false);
  });
});
