"use strict";

function render(items, dispatch) {
  return items.map((item) => {
    if (item.kind === "separator") return { type: "separator" };

    const rendered = {
      label: item.label,
      enabled: item.enabled !== false,
    };
    if (item.kind === "checkbox" || item.kind === "radio") {
      rendered.type = item.kind;
      rendered.checked = item.checked === true;
    }
    if (item.kind === "submenu") {
      rendered.submenu = render(item.items, dispatch);
    } else if (item.id) {
      rendered.click = () => dispatch(item.id);
    }
    return rendered;
  });
}

function createElectronTrayBackend({ Tray, Menu, normalIcon, attentionIcon, tooltip, dispatch }) {
  let tray = null;
  let opened = () => {};

  return {
    start(snapshot) {
      if (tray) return;
      tray = new Tray(normalIcon);
      tray.setToolTip(tooltip);
      if (typeof tray.on === "function") {
        tray.on("click", () => opened());
        tray.on("right-click", () => opened());
      }
      this.replaceMenu(snapshot);
    },
    replaceMenu(snapshot) {
      if (!tray) return;
      tray.setContextMenu(Menu.buildFromTemplate(render(snapshot.items, dispatch)));
    },
    setAttention(active) {
      if (tray) tray.setImage(active ? attentionIcon : normalIcon);
    },
    onMenuOpened(handler) {
      opened = handler;
    },
    isActive() {
      return tray !== null;
    },
    stop() {
      if (!tray) return;
      tray.destroy();
      tray = null;
    },
    getNativeTray() {
      return tray;
    },
  };
}

module.exports = { createElectronTrayBackend };
