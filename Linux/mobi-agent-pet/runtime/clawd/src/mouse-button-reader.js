"use strict";

// Read button state without capturing clicks or activating an overlay window.
// Bits: left=1, right=2, middle=4. Native access is lazy and best-effort.
module.exports = function createMouseButtonReader(options = {}) {
  const platform = options.platform || process.platform;
  let native = null;
  let unavailable = false;

  function initialize() {
    if (!["win32", "darwin", "linux"].includes(platform)) return null;
    const koffi = options.koffi || require("koffi");
    if (platform === "win32") {
      const lib = koffi.load("user32.dll");
      const getState = lib.func("short __stdcall GetAsyncKeyState(int key)");
      return { read: () => [1, 2, 4].reduce((mask, key, index) =>
        mask | ((getState(key) & 0x8000) ? 1 << index : 0), 0), stop() {} };
    }
    if (platform === "darwin") {
      const lib = koffi.load("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics");
      const getState = lib.func("bool CGEventSourceButtonState(int state, uint button)");
      return { read: () => [0, 1, 2].reduce((mask, button) =>
        mask | (getState(0, button) ? 1 << button : 0), 0), stop() {} };
    }
    const lib = koffi.load("libX11.so.6");
    const open = lib.func("void *XOpenDisplay(const char *name)");
    const close = lib.func("int XCloseDisplay(void *display)");
    const root = lib.func("ulong XDefaultRootWindow(void *display)");
    const query = lib.func("int XQueryPointer(void *display, ulong window, _Out_ ulong *root_return, _Out_ ulong *child_return, _Out_ int *root_x, _Out_ int *root_y, _Out_ int *window_x, _Out_ int *window_y, _Out_ uint *mask_return)");
    let display = null;
    return {
      read() {
        if (!display) display = open(null);
        if (!display) return null;
        const values = Array.from({ length: 7 }, () => [0]);
        if (!query(display, root(display), ...values)) return null;
        const mask = values[6][0];
        return ((mask & 256) ? 1 : 0) | ((mask & 1024) ? 2 : 0) | ((mask & 512) ? 4 : 0);
      },
      stop() {
        if (display) close(display);
        display = null;
      },
    };
  }

  return {
    read() {
      if (unavailable) return null;
      try {
        if (!native) native = initialize();
        if (!native) { unavailable = true; return null; }
        return native.read();
      } catch {
        unavailable = true;
        return null;
      }
    },
    stop() {
      try { native?.stop(); } catch {}
      unavailable = false;
    },
  };
};
