import { FolderPlus } from "lucide-react";

import { formatDuration } from "../model.mjs";
import type { AgentLogApi, HumanSession, OverviewSnapshot, ProjectSummary } from "../types";
import { HumanTimerBar } from "../components/HumanTimerBar";

type OverviewPageProps = {
  now?: () => number;
  onOpenProjects: () => void;
  projects: ProjectSummary[];
  snapshot: OverviewSnapshot;
  timerApi: AgentLogApi["humanTimer"];
};

function eventLabel(event: OverviewSnapshot["recentActivity"][number]) {
  return event.toolName || event.type || "Activity";
}

function eventTime(at: number) {
  if (!Number.isFinite(at)) return "Unknown time";
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function OverviewPage({ now, onOpenProjects, projects, snapshot, timerApi }: OverviewPageProps) {
  return (
    <section className="overview-workspace" aria-labelledby="overview-title">
      <div className="workspace__heading overview-workspace__heading">
        <div>
          <p className="eyebrow">Today</p>
          <h2 id="overview-title">Live work</h2>
        </div>
        <button type="button" className="command-button" onClick={onOpenProjects}>
          <FolderPlus aria-hidden="true" size={15} />
          {snapshot.pendingProjectCount > 0 ? "Review pending projects" : "Add project"}
        </button>
      </div>

      <HumanTimerBar
        now={now}
        onOpenProjects={onOpenProjects}
        onTimerChange={(_timer: HumanSession | null) => {}}
        projects={projects}
        timer={snapshot.humanTimer}
        timerApi={timerApi}
      />

      <dl className="overview-metrics">
        <div><dt>Agent session time</dt><dd>{formatDuration(snapshot.today.agentSessionMs)}</dd></div>
        <div><dt>Agent active time</dt><dd>{formatDuration(snapshot.today.agentActiveMs)}</dd></div>
        <div><dt>Human time</dt><dd>{formatDuration(snapshot.today.humanMs)}</dd></div>
        <div><dt>Pending projects</dt><dd>{snapshot.pendingProjectCount}</dd></div>
      </dl>

      <div className="overview-columns">
        <section className="overview-section" aria-labelledby="live-agents-title">
          <div className="section-heading">
            <h3 id="live-agents-title">Live agent sessions</h3>
            <span>{snapshot.activeAgentSessions.length}</span>
          </div>
          {snapshot.activeAgentSessions.length > 0 ? (
            <div className="table-scroll">
              <table className="agent-table">
                <thead><tr><th>Agent</th><th>Project</th><th>State</th><th>Active</th></tr></thead>
                <tbody>
                  {snapshot.activeAgentSessions.map((session) => (
                    <tr key={session.id}>
                      <td>{session.agentId}</td>
                      <td>{session.projectName || "Unassigned"}</td>
                      <td><span className="record-state record-state--active">{session.latestState || "active"}</span></td>
                      <td>{formatDuration(session.activeMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="section-empty"><span>No agent sessions are active.</span><button type="button" onClick={onOpenProjects}>Add project</button></div>
          )}
        </section>

        <section className="overview-section" aria-labelledby="recent-activity-title">
          <div className="section-heading">
            <h3 id="recent-activity-title">Recent activity</h3>
            <span>{snapshot.recentActivity.length}</span>
          </div>
          {snapshot.recentActivity.length > 0 ? (
            <ol className="activity-list">
              {snapshot.recentActivity.map((event) => (
                <li key={event.id}>
                  <span className="activity-list__time">{eventTime(event.occurredAt)}</span>
                  <div><strong>{eventLabel(event)}</strong><span>{event.projectName || event.cwd || "Unassigned"} / {event.agentId}</span></div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="section-empty"><span>No recent agent activity.</span><button type="button" onClick={onOpenProjects}>Add project</button></div>
          )}
        </section>
      </div>
    </section>
  );
}
