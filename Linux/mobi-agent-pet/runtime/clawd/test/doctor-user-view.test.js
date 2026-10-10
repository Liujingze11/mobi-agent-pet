const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildDoctorUserView } = require("../src/doctor-user-view");

describe("simple Doctor view", () => {
  const checks = [{ id: "agent-integrations", details: [
    { agentId: "codex", agentName: "Codex", status: "ok" },
    { agentId: "claude-code", agentName: "Claude Code", status: "not-managed" },
  ] }];

  it("shows only configured agents and does not claim an unused agent is broken", () => {
    const view = buildDoctorUserView({ checks, records: [], events: [], features: {} });
    assert.equal(view.agents.length, 1);
    assert.equal(view.agents[0].status, "waiting");
    assert.equal(view.agents[0].feedback, "waiting");
    assert.equal(view.agents[0].recording, "waiting");
  });

  it("separates connection, feedback and durable recording", () => {
    const view = buildDoctorUserView({
      checks,
      events: [{ agentId: "codex", outcome: "accepted", route: "state", timestamp: 100 }],
      records: [{ agentId: "codex", lastRecordedAt: 90 }],
      features: {},
    });
    assert.equal(view.agents[0].status, "ok");
    assert.equal(view.agents[0].feedback, "ok");
    assert.equal(view.agents[0].recording, "ok");
  });

  it("keeps a deliberately hidden pet neutral and includes the conversation jump check", () => {
    const view = buildDoctorUserView({
      checks: [], features: { icon: "ok", pet: "hidden", data: "ok", jump: "waiting" },
    });
    assert.deepEqual(view.features.map((feature) => feature.id), ["icon", "pet", "data", "jump"]);
    assert.equal(view.features[1].status, "hidden");
    assert.equal(view.features[3].status, "waiting");
  });

  it("includes registered custom Agents without claiming unobserved activity", () => {
    const view = buildDoctorUserView({
      checks: [], customApplications: [{ id: "custom-my-agent", name: "My Agent" }],
      agentPrefs: { "custom-my-agent": { enabled: true } },
    });
    assert.equal(view.agents[0].name, "My Agent");
    assert.equal(view.agents[0].connection, "ok");
    assert.equal(view.agents[0].status, "waiting");
  });
});
