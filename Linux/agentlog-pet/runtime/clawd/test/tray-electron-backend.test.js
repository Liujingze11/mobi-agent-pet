"use strict";

const assert = require("node:assert");
const test = require("node:test");

const { createElectronTrayBackend } = require("../src/tray-electron-backend");

function makeElectron() {
  const trays = [];
  const templates = [];

  class Tray {
    constructor(icon) {
      this.icon = icon;
      this.events = new Map();
      this.images = [];
      this.destroyCount = 0;
      trays.push(this);
    }

    setToolTip(tooltip) { this.tooltip = tooltip; }
    setContextMenu(menu) { this.menu = menu; }
    setImage(icon) { this.images.push(icon); }
    destroy() { this.destroyCount += 1; }
    on(event, handler) { this.events.set(event, handler); }
    emit(event) { this.events.get(event)(); }
  }

  return {
    Tray,
    Menu: {
      buildFromTemplate(template) {
        templates.push(template);
        return { template };
      },
    },
    trays,
    templates,
  };
}

test("owns one Electron tray and renders, dispatches, and tears down its descriptor menu", () => {
  const electron = makeElectron();
  const normalIcon = { size: { width: 32, height: 32 } };
  const attentionIcon = { size: { width: 32, height: 32 } };
  const commands = [];
  let menuOpened = 0;
  const backend = createElectronTrayBackend({
    ...electron,
    normalIcon,
    attentionIcon,
    tooltip: "AgentLog Pet",
    dispatch: (id) => commands.push(id),
  });
  const snapshot = {
    items: [
      {
        kind: "submenu",
        label: "Mode",
        items: [
          { id: "mode.normal", kind: "radio", label: "Normal", checked: true },
          { id: "mode.automatic", kind: "radio", label: "Automatic", checked: false },
        ],
      },
      { kind: "checkbox", id: "startup.toggle", label: "Start on Login", checked: true },
    ],
  };

  backend.onMenuOpened(() => { menuOpened += 1; });
  backend.start(snapshot);
  backend.start(snapshot);

  assert.strictEqual(electron.trays.length, 1, "repeated starts must not create another tray");
  const tray = electron.trays[0];
  assert.strictEqual(tray.icon, normalIcon);
  assert.strictEqual(tray.tooltip, "AgentLog Pet");
  assert.strictEqual(backend.getNativeTray(), tray);
  assert.strictEqual(backend.isActive(), true);
  assert.deepStrictEqual(tray.menu.template, [
    {
      label: "Mode",
      enabled: true,
      submenu: [
        { label: "Normal", enabled: true, type: "radio", checked: true, click: tray.menu.template[0].submenu[0].click },
        { label: "Automatic", enabled: true, type: "radio", checked: false, click: tray.menu.template[0].submenu[1].click },
      ],
    },
    {
      label: "Start on Login",
      enabled: true,
      type: "checkbox",
      checked: true,
      click: tray.menu.template[1].click,
    },
  ]);

  tray.menu.template[0].submenu[1].click();
  assert.deepStrictEqual(commands, ["mode.automatic"]);

  tray.emit("click");
  tray.emit("right-click");
  assert.strictEqual(menuOpened, 2);

  backend.setAttention(true);
  backend.setAttention(false);
  assert.deepStrictEqual(tray.images, [attentionIcon, normalIcon]);
  assert.deepStrictEqual(tray.images.map((icon) => icon.size), [
    { width: 32, height: 32 },
    { width: 32, height: 32 },
  ]);

  backend.stop();
  backend.stop();
  backend.setAttention(true);
  backend.replaceMenu(snapshot);
  assert.strictEqual(tray.destroyCount, 1);
  assert.strictEqual(backend.isActive(), false);
  assert.strictEqual(backend.getNativeTray(), null);
  assert.strictEqual(electron.templates.length, 1, "stopped backends reject menu replacements");
});
