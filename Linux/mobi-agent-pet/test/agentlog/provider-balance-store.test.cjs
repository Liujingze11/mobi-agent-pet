"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { openAgentLogDatabase } = require("../../runtime/agentlog/storage/database.cjs");
const { createProviderBalanceStore } = require("../../runtime/agentlog/providers/balance-store.cjs");

test("balance cache stores money and quota separately and retains stale values", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-balance-store-"));
  const db = openAgentLogDatabase({ databasePath: path.join(dir, "data.db") });
  try {
    db.prepare("INSERT INTO providers(id,app_id,name,activation,config_cipher,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .run("one", "claude", "One", "available", "cipher", 1, 1);
    db.prepare("INSERT INTO providers(id,app_id,name,activation,config_cipher,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .run("two", "codex", "Two", "available", "cipher", 1, 1);
    const store = createProviderBalanceStore(db, { now: () => 1000 });
    assert.equal(store.put("one", { kind: "money", amount: 12.5, currency: "USD" }).amount, 12.5);
    assert.equal(store.put("two", { kind: "quota", remaining: 200, unit: "requests", resetAt: 2000 }).kind, "quota");
    assert.equal(store.markFailure("one", "auth").amount, 12.5);
    assert.equal(store.get("one").stale, true);
    assert.equal(store.invalidate("one").amount, 12.5);
    assert.equal(store.get("one").error, null);
    assert.deepEqual(store.listVisible({ activeIds: ["one"], enabledIds: [] }).map((item) => item.providerId), ["one"]);
    assert.throws(() => store.put("one", { kind: "money", amount: -1, currency: "USD" }), /invalid/i);
    db.prepare("DELETE FROM providers WHERE id=?").run("one");
    assert.equal(store.get("one"), null);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
