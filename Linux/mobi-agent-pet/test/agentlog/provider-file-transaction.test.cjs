"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { openAgentLogDatabase } = require("../../runtime/agentlog/storage/database.cjs");
const { createProviderFileTransaction } = require("../../runtime/agentlog/providers/file-transaction.cjs");

function hash(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }

function fixture(fsApi = fs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-file-txn-"));
  const db = openAgentLogDatabase({ databasePath: path.join(dir, "data.db") });
  const vault = {
    seal: (value) => Buffer.from(JSON.stringify(value)).toString("base64"),
    open: (value) => JSON.parse(Buffer.from(value, "base64").toString()),
  };
  const txn = createProviderFileTransaction({ db, fs: fsApi, vault, now: () => 1000 });
  return { dir, db, txn, close() { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test("publishes two config files then commits the pointer and clears the journal", async () => {
  const f = fixture();
  try {
    const first = path.join(f.dir, "config.toml");
    const second = path.join(f.dir, "auth.json");
    fs.writeFileSync(first, "# user comment\nmodel = \"old\"\n");
    fs.writeFileSync(second, '{"token":"old"}');
    const current = [fs.readFileSync(first), fs.readFileSync(second)];
    let committed = false;
    await f.txn.run({ appId: "codex", providerId: "new", changes: [
      { path: first, originalHash: hash(current[0]), nextBytes: Buffer.from('# user comment\nmodel = "new"\n'), mode: 0o600 },
      { path: second, originalHash: hash(current[1]), nextBytes: Buffer.from('{"token":"new"}'), mode: 0o600 },
    ], commit: () => { committed = true; } });
    assert.equal(fs.readFileSync(first, "utf8").includes("user comment"), true);
    assert.equal(JSON.parse(fs.readFileSync(second, "utf8")).token, "new");
    assert.equal(committed, true);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM provider_file_transactions").get().count, 0);
  } finally { f.close(); }
});

test("detects an external edit before changing any file", async () => {
  const f = fixture();
  try {
    const file = path.join(f.dir, "settings.json");
    fs.writeFileSync(file, "external");
    await assert.rejects(() => f.txn.run({ appId: "claude", providerId: "new", changes: [
      { path: file, originalHash: hash(Buffer.from("old")), nextBytes: Buffer.from("new"), mode: 0o600 },
    ] }), /conflict/i);
    assert.equal(fs.readFileSync(file, "utf8"), "external");
  } finally { f.close(); }
});

test("rolls back the first file when publishing the second fails", async () => {
  let publishCount = 0;
  const failingFs = { ...fs, renameSync(from, to) {
    if (to.endsWith("auth.json") && ++publishCount === 1) throw new Error("injected write failure");
    return fs.renameSync(from, to);
  } };
  const f = fixture(failingFs);
  try {
    const config = path.join(f.dir, "config.toml");
    const auth = path.join(f.dir, "auth.json");
    fs.writeFileSync(config, "original-config");
    fs.writeFileSync(auth, "original-auth");
    await assert.rejects(() => f.txn.run({ appId: "codex", providerId: "new", changes: [
      { path: config, originalHash: hash(fs.readFileSync(config)), nextBytes: Buffer.from("new-config"), mode: 0o600 },
      { path: auth, originalHash: hash(fs.readFileSync(auth)), nextBytes: Buffer.from("new-auth"), mode: 0o600 },
    ] }), /injected write failure/);
    assert.equal(fs.readFileSync(config, "utf8"), "original-config");
    assert.equal(fs.readFileSync(auth, "utf8"), "original-auth");
  } finally { f.close(); }
});

test("startup recovery rolls back a published file before its pointer committed", async () => {
  const f = fixture();
  try {
    const file = path.join(f.dir, "settings.json");
    const old = Buffer.from('{"hook":"keep","key":"old"}');
    const next = Buffer.from('{"hook":"keep","key":"new"}');
    fs.writeFileSync(file, next);
    const entries = [{ path: file, originalHash: hash(old), originalBytes: old.toString("base64"), nextHash: hash(next), mode: 0o600 }];
    const cipher = Buffer.from(JSON.stringify({ entries })).toString("base64");
    f.db.prepare("INSERT INTO provider_file_transactions(id,app_id,provider_id,entries_cipher,started_at) VALUES(?,?,?,?,?)")
      .run("unfinished", "claude", "new", cipher, 1);
    await f.txn.recover();
    assert.equal(fs.readFileSync(file, "utf8"), old.toString());
    assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM provider_file_transactions").get().count, 0);
  } finally { f.close(); }
});
