"use strict";

const LIMITS = Object.freeze({
  lineBytes: 65536,
  menuDepth: 3,
  menuItems: 64,
  labelChars: 160,
  commandIdChars: 80,
});

const PARENT_TYPES = new Set(["init", "replace-menu", "set-icon", "shutdown"]);
const HELPER_TYPES = new Set(["ready", "host-status", "menu-opened", "command", "error", "stopped"]);
const ICON_NAMES = new Set(["agentlog-pet", "agentlog-pet-attention"]);
const ITEM_KINDS = new Set(["command", "checkbox", "radio", "submenu", "separator"]);

class TrayProtocolError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "TrayProtocolError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new TrayProtocolError(code, message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value) {
  if (!isRecord(value)) fail("invalid-message", "message must be an object");
}

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function checkKeys(value, allowed) {
  for (const key of Object.keys(value)) {
    if (allowed.has(key)) continue;
    if (key === "click" || key === "path" || key === "command") {
      fail("forbidden-key", `forbidden key: ${key}`);
    }
    fail("unknown-field", `unknown field: ${key}`);
  }
}

function requiredString(value, field, maxChars) {
  if (typeof value !== "string" || value.length === 0) {
    fail("invalid-field", `${field} must be a non-empty string`);
  }
  if (maxChars !== undefined && Array.from(value).length > maxChars) {
    fail(field === "id" ? "command-id-too-long" : "label-too-long", `${field} is too long`);
  }
  return value;
}

function requiredBoolean(value, field) {
  if (typeof value !== "boolean") fail("invalid-field", `${field} must be boolean`);
  return value;
}

function requiredRevision(value, options) {
  if (!Number.isSafeInteger(value) || value < 0) fail("invalid-revision", "revision must be a safe nonnegative integer");
  const currentRevision = options && (
    options.currentRevision ?? options.minRevision ?? options.lastRevision
  );
  if (currentRevision !== undefined && (!Number.isSafeInteger(currentRevision) || currentRevision < 0)) {
    fail("invalid-revision", "revision bound must be a safe nonnegative integer");
  }
  if (currentRevision !== undefined && value < currentRevision) {
    fail("stale-revision", "revision is stale");
  }
  return value;
}

function freezeDeep(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function normalizeItems(items, state, depth) {
  if (!Array.isArray(items)) fail("invalid-field", "items must be an array");
  if (depth > LIMITS.menuDepth) fail("menu-too-deep", "menu nesting is too deep");

  const normalized = [];
  for (const item of items) {
    state.count += 1;
    if (state.count > LIMITS.menuItems) fail("menu-too-many-items", "menu has too many items");
    requireRecord(item);
    if (typeof item.kind !== "string" || !ITEM_KINDS.has(item.kind)) {
      fail("invalid-field", "unknown menu item kind");
    }

    const kind = item.kind;
    const allowed = kind === "separator"
      ? new Set(["kind"])
      : kind === "submenu"
        ? new Set(["kind", "label", "enabled", "items"])
        : new Set(["kind", "id", "label", "enabled", ...(kind === "checkbox" || kind === "radio" ? ["checked"] : [])]);
    checkKeys(item, allowed);

    if (kind === "separator") {
      normalized.push({ kind });
      continue;
    }

    const result = { kind };
    if (kind !== "submenu") {
      const id = requiredString(item.id, "id", LIMITS.commandIdChars);
      if (state.ids.has(id)) fail("duplicate-command-id", `duplicate command ID: ${id}`);
      state.ids.add(id);
      result.id = id;
    }
    result.label = requiredString(item.label, "label", LIMITS.labelChars);
    if (own(item, "enabled")) result.enabled = requiredBoolean(item.enabled, "enabled");
    if (own(item, "checked")) result.checked = requiredBoolean(item.checked, "checked");
    if (kind === "submenu") result.items = normalizeItems(item.items, state, depth + 1);
    normalized.push(result);
  }
  return normalized;
}

function normalizeMenu(items) {
  return normalizeItems(items, { count: 0, ids: new Set() }, 0);
}

function checkEnvelope(value, types) {
  requireRecord(value);
  if (!own(value, "version") || value.version !== 1) {
    fail("wrong-version", "unsupported protocol version");
  }
  if (!own(value, "type") || typeof value.type !== "string" || !types.has(value.type)) {
    fail("unknown-message-type", "unsupported message type");
  }
}

function validateParentMessage(value, options = {}) {
  checkEnvelope(value, PARENT_TYPES);
  switch (value.type) {
    case "init": {
      checkKeys(value, new Set(["version", "type", "revision", "productId", "tooltip", "iconThemeRoot", "icon", "items"]));
      const iconThemeRoot = requiredString(value.iconThemeRoot, "iconThemeRoot");
      if (typeof options.expectedIconThemeRoot !== "string" || options.expectedIconThemeRoot.length === 0) {
        fail("invalid-icon-theme-root", "expected icon theme root must be a non-empty string");
      }
      if (iconThemeRoot !== options.expectedIconThemeRoot) {
        fail("invalid-icon-theme-root", "icon theme root is not the expected packaged root");
      }
      const result = {
        version: 1,
        type: "init",
        revision: requiredRevision(value.revision, options),
        productId: requiredString(value.productId, "productId"),
        tooltip: requiredString(value.tooltip, "tooltip"),
        iconThemeRoot,
        icon: validateIcon(value.icon),
        items: normalizeMenu(value.items),
      };
      return freezeDeep(result);
    }
    case "replace-menu": {
      checkKeys(value, new Set(["version", "type", "revision", "items"]));
      return freezeDeep({
        version: 1,
        type: "replace-menu",
        revision: requiredRevision(value.revision, options),
        items: normalizeMenu(value.items),
      });
    }
    case "set-icon": {
      checkKeys(value, new Set(["version", "type", "revision", "icon"]));
      return freezeDeep({
        version: 1,
        type: "set-icon",
        revision: requiredRevision(value.revision, options),
        icon: validateIcon(value.icon),
      });
    }
    case "shutdown":
      checkKeys(value, new Set(["version", "type"]));
      return freezeDeep({ version: 1, type: "shutdown" });
    default:
      fail("unknown-message-type", "unsupported message type");
  }
}

function validateIcon(value) {
  if (typeof value !== "string" || !ICON_NAMES.has(value)) fail("invalid-icon", "unsupported icon name");
  return value;
}

function validateHelperMessage(value, options = {}) {
  checkEnvelope(value, HELPER_TYPES);
  switch (value.type) {
    case "ready":
      checkKeys(value, new Set(["version", "type", "backend"]));
      return freezeDeep({ version: 1, type: "ready", backend: requiredString(value.backend, "backend") });
    case "host-status":
      checkKeys(value, new Set(["version", "type", "watcher", "registered"]));
      return freezeDeep({
        version: 1,
        type: "host-status",
        watcher: requiredBoolean(value.watcher, "watcher"),
        registered: requiredBoolean(value.registered, "registered"),
      });
    case "menu-opened":
      checkKeys(value, new Set(["version", "type"]));
      return freezeDeep({ version: 1, type: "menu-opened" });
    case "command":
      checkKeys(value, new Set(["version", "type", "revision", "id"]));
      return freezeDeep({
        version: 1,
        type: "command",
        revision: requiredRevision(value.revision, options),
        id: requiredString(value.id, "id", LIMITS.commandIdChars),
      });
    case "error":
      checkKeys(value, new Set(["version", "type", "code", "message"]));
      return freezeDeep({
        version: 1,
        type: "error",
        code: requiredString(value.code, "code", LIMITS.commandIdChars),
        message: requiredString(value.message, "message", LIMITS.labelChars),
      });
    case "stopped":
      checkKeys(value, new Set(["version", "type"]));
      return freezeDeep({ version: 1, type: "stopped" });
    default:
      fail("unknown-message-type", "unsupported message type");
  }
}

function encodeMessage(message) {
  const line = Buffer.from(`${JSON.stringify(message)}\n`, "utf8");
  if (line.length > LIMITS.lineBytes) fail("line-too-large", "encoded line is too large");
  return line;
}

function createLineDecoder(options = {}) {
  let buffered = Buffer.alloc(0);
  let ended = false;
  const validate = typeof options.validate === "function" ? options.validate : null;
  const onMessage = typeof options.onMessage === "function" ? options.onMessage : null;

  function parseLine(line) {
    let value;
    try {
      value = JSON.parse(line.toString("utf8"));
    } catch (error) {
      fail("malformed-json", "line is not valid JSON");
    }
    const normalized = validate ? validate(value) : value;
    if (onMessage) onMessage(normalized);
    return normalized;
  }

  return {
    push(chunk) {
      if (ended) fail("decoder-ended", "decoder has ended");
      if (!Buffer.isBuffer(chunk) && typeof chunk !== "string" && !(chunk instanceof Uint8Array)) {
        fail("invalid-chunk", "chunk must be bytes or a string");
      }
      buffered = Buffer.concat([buffered, Buffer.from(chunk)]);
      const messages = [];
      while (true) {
        const newline = buffered.indexOf(0x0a);
        if (newline < 0) {
          if (buffered.length > LIMITS.lineBytes) fail("line-too-large", "buffered line is too large");
          break;
        }
        const line = buffered.subarray(0, newline + 1);
        buffered = buffered.subarray(newline + 1);
        if (line.length > LIMITS.lineBytes) fail("line-too-large", "line is too large");
        messages.push(parseLine(line.subarray(0, -1)));
      }
      return messages;
    },
    end() {
      if (ended) return [];
      ended = true;
      if (buffered.length > 0) fail("incomplete-line", "input ended before newline");
      return [];
    },
  };
}

module.exports = {
  LIMITS,
  TrayProtocolError,
  encodeMessage,
  createLineDecoder,
  validateParentMessage,
  validateHelperMessage,
};
