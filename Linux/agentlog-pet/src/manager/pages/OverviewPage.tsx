import { FolderPlus } from "lucide-react";

import { formatDuration } from "../model.mjs";
import { useI18n } from "../i18n";
import type { AgentLogApi, HumanSession, OverviewSnapshot, ProjectSummary } from "../types";
import { HumanTimerBar } from "../components/HumanTimerBar";

type OverviewPageProps = {
  now?: () => number;
  onOpenProjects: () => void;
  projects: ProjectSummary[];
  snapshot: OverviewSnapshot;
  timerApi: AgentLogApi["humanTimer"];
};

export function OverviewPage({ now, onOpenProjects, projects, snapshot, timerApi }: OverviewPageProps) {
  const { locale, t } = useI18n();
  const eventLabel = (event: OverviewSnapshot["recentActivity"][number]) => event.toolName || event.type || t("overview.activity");
  const eventTime = (at: number) => Number.isFinite(at)
    ? new Date(at).toLocaleTimeString(locale === "zh" ? "zh-CN" : "en", { hour: "2-digit", minute: "2-digit" })
    : t("overview.unknownTime");
  return (
    <section className="overview-workspace" aria-labelledby="overview-title">
      <div className="workspace__heading overview-workspace__heading">
        <div>
          <p className="eyebrow">{t("overview.eyebrow")}</p>
          <h2 id="overview-title">{t("overview.title")}</h2>
        </div>
        <button type="button" className="command-button" onClick={onOpenProjects}>
          <FolderPlus aria-hidden="true" size={15} />
          {snapshot.pendingProjectCount > 0 ? t("overview.reviewPending") : t("overview.addProject")}
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
        <div><dt>{t("overview.agentSessionTime")}</dt><dd>{formatDuration(snapshot.today.agentSessionMs)}</dd></div>
        <div><dt>{t("overview.agentActiveTime")}</dt><dd>{formatDuration(snapshot.today.agentActiveMs)}</dd></div>
        <div><dt>{t("overview.humanTime")}</dt><dd>{formatDuration(snapshot.today.humanMs)}</dd></div>
        <div><dt>{t("overview.pendingProjects")}</dt><dd>{snapshot.pendingProjectCount}</dd></div>
      </dl>

      <div className="overview-columns">
        <section className="overview-section" aria-labelledby="live-agents-title">
          <div className="section-heading">
            <h3 id="live-agents-title">{t("overview.liveSessions")}</h3>
            <span>{snapshot.activeAgentSessions.length}</span>
          </div>
          {snapshot.activeAgentSessions.length > 0 ? (
            <div className="table-scroll">
              <table className="agent-table">
                <thead><tr><th>{t("overview.agent")}</th><th>{t("overview.project")}</th><th>{t("overview.state")}</th><th>{t("overview.active")}</th></tr></thead>
                <tbody>
                  {snapshot.activeAgentSessions.map((session) => (
                    <tr key={session.id}>
                      <td>{session.agentId}</td>
                      <td>{session.projectName || t("overview.unassigned")}</td>
                      <td><span className="record-state record-state--active">{session.latestState || "active"}</span></td>
                      <td>{formatDuration(session.activeMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="section-empty"><span>{t("overview.noActiveSessions")}</span><button type="button" onClick={onOpenProjects}>{t("overview.addProject")}</button></div>
          )}
        </section>

        <section className="overview-section" aria-labelledby="recent-activity-title">
          <div className="section-heading">
            <h3 id="recent-activity-title">{t("overview.recentActivity")}</h3>
            <span>{snapshot.recentActivity.length}</span>
          </div>
          {snapshot.recentActivity.length > 0 ? (
            <ol className="activity-list">
              {snapshot.recentActivity.map((event) => (
                <li key={event.id}>
                  <span className="activity-list__time">{eventTime(event.occurredAt)}</span>
                  <div><strong>{eventLabel(event)}</strong><span>{event.projectName || event.cwd || t("overview.unassigned")} / {event.agentId}</span></div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="section-empty"><span>{t("overview.noRecentActivity")}</span><button type="button" onClick={onOpenProjects}>{t("overview.addProject")}</button></div>
          )}
        </section>
      </div>
    </section>
  );
}
