const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { recordProblem, readProblems } = require("../../runtime/agentlog/problem-journal.cjs");

describe("problem journal", () => {
  it("keeps a bounded, private history of problem codes without raw error text", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mobi-problems-"));
    try {
      recordProblem(dir, "agent-connection", { agentId: "codex", now: 1000 });
      recordProblem(dir, "agent-connection", { agentId: "codex", now: 1500 });
      recordProblem(dir, "usage-refresh", { now: 2000 });
      recordProblem(dir, "conversation-jump", { now: 2500 });
      assert.deepEqual(readProblems(dir).map((entry) => entry.code), ["conversation-jump", "usage-refresh", "agent-connection"]);
      assert.equal(fs.statSync(path.join(dir, "problem-journal.json")).mode & 0o777, 0o600);
      assert.equal(recordProblem(dir, "unknown-code", { now: 3000 }), false);
      assert.equal(recordProblem(dir, "agent-connection", { agentId: "../../secret", now: 3000 }), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
