"use strict";

const { createHash, randomUUID } = require("node:crypto");
const path = require("node:path");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function createProviderFileTransaction({ db, fs, vault, now = Date.now } = {}) {
  if (!db || !fs || !vault) throw new TypeError("database, fs and vault are required");
  const insertJournal = db.prepare("INSERT INTO provider_file_transactions(id,app_id,provider_id,entries_cipher,started_at) VALUES(?,?,?,?,?)");
  const deleteJournal = db.prepare("DELETE FROM provider_file_transactions WHERE id=?");
  const pendingRows = db.prepare("SELECT id,entries_cipher FROM provider_file_transactions ORDER BY started_at,id");
  const locks = new Map();

  function currentBytes(file) {
    try { return fs.readFileSync(file); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }

  function hashOrNull(bytes) { return bytes === null ? null : sha256(bytes); }

  function publish(file, bytes, mode) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = path.join(path.dirname(file), `.mobi-provider-${randomUUID()}.tmp`);
    let fd;
    try {
      fd = fs.openSync(temporary, "wx", mode || 0o600);
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = null;
      fs.renameSync(temporary, file);
      try {
        const dirFd = fs.openSync(path.dirname(file), "r");
        try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
      } catch { /* Some filesystems cannot fsync directories. */ }
    } finally {
      if (fd !== null && fd !== undefined) fs.closeSync(fd);
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  }

  function restore(entries) {
    for (const entry of [...entries].reverse()) {
      const current = currentBytes(entry.path);
      const currentHash = hashOrNull(current);
      if (currentHash === entry.originalHash) continue;
      if (currentHash !== entry.nextHash) throw new Error("Provider recovery conflict: file changed externally");
      if (entry.originalBytes === null) fs.unlinkSync(entry.path);
      else publish(entry.path, Buffer.from(entry.originalBytes, "base64"), entry.mode);
    }
  }

  async function execute({ appId, providerId, changes, expectedHashes = {}, commit }) {
    if (!appId || !providerId || !Array.isArray(changes) || !changes.length) throw new TypeError("invalid file transaction");
    const paths = new Set();
    const entries = changes.map((change) => {
      if (!change || typeof change.path !== "string" || !path.isAbsolute(change.path) || paths.has(change.path) ||
        !Buffer.isBuffer(change.nextBytes)) throw new TypeError("invalid file change");
      paths.add(change.path);
      const original = currentBytes(change.path);
      const originalHash = hashOrNull(original);
      if (originalHash !== change.originalHash ||
        (Object.hasOwn(expectedHashes, change.path) && expectedHashes[change.path] !== originalHash)) {
        throw new Error("Provider config conflict: file changed externally");
      }
      return {
        path: change.path, originalHash,
        originalBytes: original?.toString("base64") || null,
        nextHash: sha256(change.nextBytes),
        nextBytes: change.nextBytes,
        mode: change.mode || (original ? fs.statSync(change.path).mode & 0o777 : 0o600),
      };
    });
    const journalId = randomUUID();
    const journalEntries = entries.map(({ nextBytes, ...entry }) => entry);
    const cipher = vault.seal({ entries: journalEntries });
    db.transaction(() => insertJournal.run(journalId, appId, providerId, cipher, Math.trunc(now())))();
    try {
      for (const entry of entries) publish(entry.path, entry.nextBytes, entry.mode);
      db.transaction(() => {
        if (commit) commit();
        deleteJournal.run(journalId);
      })();
    } catch (error) {
      try {
        restore(journalEntries);
        db.transaction(() => deleteJournal.run(journalId))();
      } catch (recoveryError) {
        error.recoveryError = recoveryError;
      }
      throw error;
    }
  }

  function run(input) {
    const appId = input?.appId;
    const previous = locks.get(appId) || Promise.resolve();
    const task = previous.catch(() => {}).then(() => execute(input));
    locks.set(appId, task);
    void task.finally(() => { if (locks.get(appId) === task) locks.delete(appId); }).catch(() => {});
    return task;
  }

  function recover() {
    for (const row of pendingRows.all()) {
      const payload = vault.open(row.entries_cipher);
      restore(payload.entries);
      db.transaction(() => deleteJournal.run(row.id))();
    }
  }

  return { run, recover };
}

module.exports = { createProviderFileTransaction, sha256 };
