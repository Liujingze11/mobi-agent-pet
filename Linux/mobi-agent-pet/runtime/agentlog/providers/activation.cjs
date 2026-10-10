"use strict";

const { sha256 } = require("./file-transaction.cjs");

const SWITCHING_APPS = new Set(["claude", "codex", "gemini", "grokbuild", "claude-desktop"]);
const COEXISTING_APPS = new Set(["opencode", "openclaw", "hermes", "pi", "mcode"]);

function createProviderActivation({ repository, transaction, adapters, fs } = {}) {
  if (!repository || !transaction || !adapters || !fs) throw new TypeError("activation dependencies are required");
  const running = new Map();

  function checkedAdapter(appId) {
    const adapter = adapters[appId];
    if (!adapter) throw new Error(`Activation is not available for ${appId}`);
    return adapter;
  }

  function checkHashes(hashes, appId, activeId) {
    let mismatch = false;
    for (const [file, expected] of Object.entries(hashes || {})) {
      let current = null;
      try { current = fs.readFileSync(file); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if ((current ? sha256(current) : null) !== expected) {
        mismatch = true;
      }
    }
    if (!mismatch) return;
    if (SWITCHING_APPS.has(appId) && activeId) {
      try {
        const adapter = checkedAdapter(appId);
        const config = repository.getConfigInternal(activeId);
        const live = adapter.read();
        if (config && adapter.plan({ currentBytes: live.bytes, targetConfig: config }).length === 0) return;
      } catch { /* A malformed or changed managed field is a conflict. */ }
    }
    const error = new Error("Provider config conflict: file changed externally");
    error.agentLogValidation = true;
    error.code = "INVALID_ARGUMENT";
    throw error;
  }

  function status(appId) {
    if (!SWITCHING_APPS.has(appId) && !COEXISTING_APPS.has(appId)) throw new TypeError("invalid appId");
    if (COEXISTING_APPS.has(appId)) {
      let conflict = false;
      try { checkHashes(repository.getActive(appId)?.hashes); } catch { conflict = true; }
      return { mode: "coexist", enabledIds: repository.getEnabled(appId), conflict,
        supported: Boolean(adapters[appId]), restartHint: adapters[appId]?.restartHint() || "none" };
    }
    const active = repository.getActive(appId);
    let conflict = false;
    try { checkHashes(active?.hashes, appId, active?.providerId); } catch { conflict = true; }
    return { mode: "switch", activeId: active?.providerId || null, conflict,
      supported: Boolean(adapters[appId]), restartHint: adapters[appId]?.restartHint() || "none" };
  }

  function afterHashes(changes, previousHashes = {}) {
    const hashes = { ...previousHashes };
    for (const change of changes) hashes[change.path] = sha256(change.nextBytes);
    return hashes;
  }

  async function switchTo(appId, providerId, config) {
    const adapter = checkedAdapter(appId);
    const previous = repository.getActive(appId);
    checkHashes(previous?.hashes, appId, previous?.providerId);
    const live = adapter.read();
    const original = adapter.importCurrent();
    if (!repository.getOriginal(appId)) repository.setOriginal(appId, original?.settingsConfig || live.config);
    const changes = adapter.plan({ currentBytes: live.bytes, previousConfig: previous?.providerId
      ? repository.getConfigInternal(previous.providerId) : null, targetConfig: config });
    const hashes = afterHashes(changes, live.hashes || { [live.path]: live.hash });
    if (changes.length) {
      await transaction.run({ appId, providerId: providerId || `original:${appId}`, changes,
        commit: () => {
          if (!adapter.verify({ targetConfig: config })) throw new Error("Provider activation verification failed");
          repository.setActive(appId, providerId, hashes);
        } });
    } else {
      if (!adapter.verify({ targetConfig: config })) throw new Error("Provider activation verification failed");
      repository.setActive(appId, providerId, hashes);
    }
    return status(appId);
  }

  function locked(appId, action) {
    const previous = running.get(appId) || Promise.resolve();
    const task = previous.catch(() => {}).then(action);
    running.set(appId, task);
    void task.finally(() => { if (running.get(appId) === task) running.delete(appId); }).catch(() => {});
    return task;
  }

  function activate(providerId) {
    const row = repository.getDraft(providerId);
    if (!row) throw new Error("Provider not found");
    if (!SWITCHING_APPS.has(row.appId)) throw new Error("Use addToLive for a coexisting provider");
    if (row.activation !== "available") throw new Error(row.unavailableReason || "Provider cannot be activated");
    return locked(row.appId, () => switchTo(row.appId, providerId, row.settingsConfig));
  }

  function restoreOriginal(appId) {
    if (!SWITCHING_APPS.has(appId)) throw new TypeError("invalid switching appId");
    const original = repository.getOriginal(appId);
    if (!original) throw new Error("No original configuration was captured");
    return locked(appId, () => switchTo(appId, null, original));
  }

  async function setLive(row, enabled) {
    const appId = row.appId;
    const enabledIds = repository.getEnabled(appId);
    if (!enabled && !enabledIds.includes(row.id)) return status(appId);
    const enabledKeys = repository.getEnabledKeys(appId);
    const nativeKey = enabledKeys[row.id] || row.metadata?.providerKey || row.id;
    if (typeof nativeKey !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(nativeKey)) {
      throw new TypeError("invalid provider config key");
    }
    const adapter = checkedAdapter(appId);
    checkHashes(repository.getActive(appId)?.hashes);
    const live = adapter.read();
    if (enabled && enabledIds.some((id) => id !== row.id &&
        enabledKeys[id] === nativeKey)) {
      throw new Error("Provider config key is already in use");
    }
    const changes = enabled ? adapter.planAdd({ providerId: nativeKey, config: row.settingsConfig,
      currentBytes: live.bytes, allowExisting: enabledIds.includes(row.id) })
      : adapter.planRemove({ providerId: nativeKey, currentBytes: live.bytes });
    const nextIds = enabled ? [...new Set([...enabledIds, row.id])] : enabledIds.filter((id) => id !== row.id);
    const hashes = afterHashes(changes, { [live.path]: live.hash });
    const commit = () => {
      if (!adapter.verify({ providerId: nativeKey, enabled })) throw new Error("Provider activation verification failed");
      repository.setEnabled(appId, nextIds, { [row.id]: nativeKey });
      repository.setActive(appId, null, hashes);
    };
    if (changes.length) await transaction.run({ appId, providerId: row.id, changes, commit });
    else commit();
    return status(appId);
  }

  function changeLive(providerId, enabled) {
    const row = repository.getDraft(providerId);
    if (!row) throw new Error("Provider not found");
    if (!COEXISTING_APPS.has(row.appId)) throw new Error("Use activate for a switching provider");
    if (enabled && row.activation !== "available") throw new Error(row.unavailableReason || "Provider cannot be activated");
    return locked(row.appId, () => setLive(row, enabled));
  }

  function refreshFromDisk(appId) { return status(appId); }

  return { status, activate, addToLive: (id) => changeLive(id, true),
    removeFromLive: (id) => changeLive(id, false), restoreOriginal, refreshFromDisk };
}

module.exports = { createProviderActivation, SWITCHING_APPS, COEXISTING_APPS };
