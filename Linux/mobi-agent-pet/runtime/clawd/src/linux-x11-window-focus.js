"use strict";

const fs = require("node:fs");

const PROCESS_BOUNDARIES = new Set(["gnome-shell", "systemd", "init"]);
const CLIENT_MESSAGE = 33;
const WINDOW_MANAGER_MASK = (1 << 19) | (1 << 20);

function readProcess(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const open = stat.indexOf("(");
    const close = stat.lastIndexOf(")");
    if (open < 0 || close <= open) return null;
    const parentPid = Number(stat.slice(close + 1).trim().split(/\s+/)[1]);
    if (!Number.isSafeInteger(parentPid) || parentPid < 0) return null;
    return { name: stat.slice(open + 1, close).toLowerCase(), parentPid };
  } catch {
    return null;
  }
}

function findProcessWindow(request, options = {}) {
  const windows = Array.isArray(options.windows) ? options.windows : [];
  const read = options.readProcess || readProcess;
  const starts = [
    ...(Array.isArray(request && request.pidChain) ? request.pidChain : []),
    request && request.sourcePid,
  ];
  const seen = new Set();
  for (const start of starts) {
    let pid = start;
    for (let depth = 0; depth < 24 && Number.isSafeInteger(pid) && pid > 1 && !seen.has(pid); depth += 1) {
      const info = read(pid);
      if (!info || PROCESS_BOUNDARIES.has(info.name)) break;
      const window = windows.find((entry) => entry && entry.pid === pid);
      if (window) return window;
      seen.add(pid);
      pid = info.parentPid;
    }
  }
  return null;
}

function createX11() {
  const koffi = require("koffi");
  const lib = koffi.load("libX11.so.6");
  const openDisplay = lib.func("void *XOpenDisplay(const char *display_name)");
  const rootWindow = lib.func("ulong XDefaultRootWindow(void *display)");
  const internAtom = lib.func("ulong XInternAtom(void *display, const char *name, int only_if_exists)");
  const getProperty = lib.func("int XGetWindowProperty(void *display, ulong window, ulong property, long long_offset, long long_length, int delete, ulong req_type, _Out_ ulong *actual_type_return, _Out_ int *actual_format_return, _Out_ ulong *nitems_return, _Out_ ulong *bytes_after_return, _Out_ void **prop_return)");
  const sendEvent = lib.func("int XSendEvent(void *display, ulong window, int propagate, long event_mask, void *event_send)");
  const flush = lib.func("int XFlush(void *display)");
  const free = lib.func("int XFree(void *data)");
  const closeDisplay = lib.func("int XCloseDisplay(void *display)");
  const display = openDisplay(null);
  if (!display) throw new Error("X11 display unavailable");
  const root = rootWindow(display);

  function property(window, name) {
    const actualType = [null];
    const format = [null];
    const count = [null];
    const remaining = [null];
    const data = [null];
    const status = getProperty(display, window, internAtom(display, name, 0), 0, 4096, 0, 0,
      actualType, format, count, remaining, data);
    if (status !== 0 || format[0] !== 32 || !data[0]) {
      if (data[0]) free(data[0]);
      return [];
    }
    try {
      return koffi.decode(data[0], "ulong", count[0]);
    } finally {
      free(data[0]);
    }
  }

  return {
    listWindows() {
      return property(root, "_NET_CLIENT_LIST").map((id) => ({
        id,
        pid: property(id, "_NET_WM_PID")[0] || null,
      }));
    },
    activeWindow() {
      return property(root, "_NET_ACTIVE_WINDOW")[0] || null;
    },
    activateWindow(id) {
      const data = koffi.union({
        b: koffi.array("char", 20),
        s: koffi.array("short", 10),
        l: koffi.array("long", 5),
      });
      const clientMessage = koffi.struct({
        type: "int", serial: "ulong", send_event: "int", display: "void *",
        window: "ulong", message_type: "ulong", format: "int", data,
      });
      const eventType = koffi.union({ xclient: clientMessage, pad: koffi.array("long", 24) });
      const event = Buffer.alloc(koffi.sizeof(eventType));
      koffi.encode(event, eventType, {
        xclient: {
          type: CLIENT_MESSAGE, serial: 0, send_event: 1, display,
          window: id, message_type: internAtom(display, "_NET_ACTIVE_WINDOW", 0),
          format: 32, data: { l: [1, 0, 0, 0, 0] },
        },
      });
      const sent = sendEvent(display, root, 0, WINDOW_MANAGER_MASK, event) !== 0;
      flush(display);
      return sent;
    },
    close() { closeDisplay(display); },
  };
}

function focusLinuxX11Window(request, options = {}) {
  let x11;
  try {
    x11 = options.x11 || createX11();
    const window = findProcessWindow(request, {
      readProcess: options.readProcess,
      windows: x11.listWindows(),
    });
    if (!window) return { submitted: false, reason: "window-not-found" };
    if (!x11.activateWindow(window.id)) return { submitted: false, reason: "activate-rejected" };
    return { submitted: true, windowId: window.id };
  } catch {
    return { submitted: false, reason: "x11-unavailable" };
  } finally {
    if (x11 && typeof x11.close === "function") x11.close();
  }
}

function getLinuxX11ActiveWindow() {
  let x11;
  try {
    x11 = createX11();
    return x11.activeWindow();
  } catch {
    return null;
  } finally {
    if (x11) x11.close();
  }
}

module.exports = { findProcessWindow, focusLinuxX11Window, getLinuxX11ActiveWindow };
