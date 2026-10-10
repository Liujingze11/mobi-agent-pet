"use strict";

const WARNING = new Set(["not-connected", "broken-path", "config-corrupt", "needs-review"]);

function buildDoctorUserView({ checks = [], events = [], records = [], features = {}, customApplications = [], agentPrefs = {} } = {}) {
  if (!Array.isArray(checks)) checks = [];
  if (!Array.isArray(events)) events = [];
  if (!Array.isArray(records)) records = [];
  if (!Array.isArray(customApplications)) customApplications = [];
  if (!features || typeof features !== "object") features = {};
  const agentCheck = checks.find((check) => check && check.id === "agent-integrations");
  const details = agentCheck && Array.isArray(agentCheck.details) ? agentCheck.details : [];
  const recordedAt = new Map(records.map((entry) => [entry.agentId, Number(entry.lastRecordedAt) || 0]));
  const receivedAt = new Map();
  for (const event of events) {
    if (!event || event.outcome !== "accepted" || event.route !== "state") continue;
    receivedAt.set(event.agentId, Math.max(receivedAt.get(event.agentId) || 0, Number(event.timestamp) || 0));
  }
  const customDetails = customApplications
    .filter((application) => application && typeof application.id === "string" && application.id.startsWith("custom-"))
    .map((application) => ({
      agentId: application.id,
      agentName: application.name || application.id,
      status: agentPrefs && agentPrefs[application.id] && agentPrefs[application.id].enabled === false ? "disabled" : "registered",
    }));
  const agents = [...details, ...customDetails]
    .filter((detail) => detail && detail.agentId && detail.status !== "not-managed")
    .map((detail) => {
      const off = detail.status === "disabled";
      const issue = WARNING.has(detail.status) || detail.level === "warning" || detail.level === "critical";
      const feedbackAt = Math.max(receivedAt.get(detail.agentId) || 0, recordedAt.get(detail.agentId) || 0);
      const recordAt = recordedAt.get(detail.agentId) || 0;
      const connection = off ? "off" : issue ? "issue" : detail.status === "ok" || detail.status === "registered" ? "ok" : "waiting";
      const feedback = off ? "off" : feedbackAt > 0 ? "ok" : "waiting";
      const recording = off ? "off" : recordAt > 0 ? "ok" : "waiting";
      const status = off ? "off" : issue ? "issue" : connection === "ok" && feedback === "ok" && recording === "ok" ? "ok" : "waiting";
      return {
        id: detail.agentId,
        name: detail.agentName || detail.agentId,
        status,
        connection,
        feedback,
        recording,
        lastActivityAt: feedbackAt || null,
        fixAction: issue && detail.fixAction ? detail.fixAction : null,
      };
    });
  const featureItems = ["icon", "pet", "data", "jump"].map((id) => ({
    id,
    status: ["ok", "issue", "waiting", "hidden"].includes(features[id]) ? features[id] : "waiting",
  }));
  return { agents, features: featureItems };
}

module.exports = { buildDoctorUserView };
