import { Pause, Play, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { deriveHumanTimerMs, deriveTimerActions, formatElapsedClock } from "../model.mjs";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n";
import type { AgentLogApi, HumanSession, HumanTimerCommandResult, ProjectSummary } from "../types";

type TimerAction = "start" | "pause" | "resume" | "stop";

type HumanTimerBarProps = {
  now?: () => number;
  onOpenProjects: () => void;
  onTimerChange: (timer: HumanSession | null) => void;
  projects: ProjectSummary[];
  timer: HumanSession | null;
  timerApi: AgentLogApi["humanTimer"];
};

function activeTimer(result: HumanTimerCommandResult): HumanSession | null {
  if (!result || "code" in result || result.status === "completed") return null;
  return result;
}

function commandError(result: HumanTimerCommandResult): TranslationKey | null {
  if (!result || !("code" in result)) return null;
  if (result.code === "PROJECT_ARCHIVED") return "timer.errorArchived";
  if (result.code === "PROJECT_NOT_FOUND") return "timer.errorUnavailable";
  return "timer.errorChanged";
}

export function HumanTimerBar({
  now = Date.now,
  onOpenProjects,
  onTimerChange,
  projects,
  timer,
  timerApi,
}: HumanTimerBarProps) {
  const { t } = useI18n();
  const selectableProjects = useMemo(
    () => projects.filter((project) => project.lifecycle === "active"),
    [projects]
  );
  const [currentTimer, setCurrentTimer] = useState<HumanSession | null>(activeTimer(timer));
  const [selectedProjectId, setSelectedProjectId] = useState(selectableProjects[0]?.id || "");
  const [busy, setBusy] = useState<TimerAction | null>(null);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [tick, setTick] = useState(() => now());

  useEffect(() => {
    setCurrentTimer(activeTimer(timer));
  }, [timer]);

  useEffect(() => {
    if (!selectableProjects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(selectableProjects[0]?.id || "");
    }
  }, [selectableProjects, selectedProjectId]);

  useEffect(() => {
    setTick(now());
    if (currentTimer?.status !== "running") return undefined;
    const interval = window.setInterval(() => setTick(now()), 1_000);
    return () => window.clearInterval(interval);
  }, [currentTimer?.id, currentTimer?.status, now]);

  const actions = deriveTimerActions(currentTimer) as TimerAction[];
  const elapsed = formatElapsedClock(deriveHumanTimerMs(currentTimer, tick));

  async function run(action: TimerAction) {
    if (busy) return;
    if (action === "start" && !selectedProjectId) return;
    setBusy(action);
    setError(null);
    try {
      const result = action === "start"
        ? await timerApi.start(selectedProjectId)
        : action === "pause"
          ? await timerApi.pause()
          : action === "resume"
            ? await timerApi.resume()
            : await timerApi.stop();
      const resultErrorKey = commandError(result);
      if (resultErrorKey) {
        const authoritativeTimer = result && "code" in result ? activeTimer(result.state) : null;
        setCurrentTimer(authoritativeTimer);
        onTimerChange(authoritativeTimer);
        setTick(now());
        setError(resultErrorKey);
        return;
      }
      const nextTimer = activeTimer(result);
      setCurrentTimer(nextTimer);
      onTimerChange(nextTimer);
      setTick(now());
    } catch {
      setError("timer.errorUpdate");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="human-timer" aria-labelledby="human-timer-title">
      <div className="human-timer__identity">
        <span id="human-timer-title">{t("timer.title")}</span>
        <strong>{currentTimer?.projectName || t("timer.noProject")}</strong>
      </div>
      <output className="human-timer__clock" aria-live="off">{elapsed}</output>
      <div className="human-timer__controls">
        {actions.includes("start") && selectableProjects.length > 0 ? (
          <select
            aria-label={t("timer.project")}
            disabled={Boolean(busy)}
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
          >
            {selectableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        ) : null}
        {actions.includes("start") && selectableProjects.length === 0 ? (
          <button type="button" className="command-button" onClick={onOpenProjects}>{t("timer.addProject")}</button>
        ) : null}
        {actions.includes("start") && selectableProjects.length > 0 ? (
          <button type="button" className="icon-button icon-button--primary" aria-label={t("timer.start")} title={t("timer.start")} disabled={Boolean(busy)} onClick={() => void run("start")}>
            <Play aria-hidden="true" size={16} />
          </button>
        ) : null}
        {actions.includes("pause") ? (
          <button type="button" className="icon-button" aria-label={t("timer.pause")} title={t("timer.pause")} disabled={Boolean(busy)} onClick={() => void run("pause")}>
            <Pause aria-hidden="true" size={16} />
          </button>
        ) : null}
        {actions.includes("resume") ? (
          <button type="button" className="icon-button icon-button--primary" aria-label={t("timer.resume")} title={t("timer.resume")} disabled={Boolean(busy)} onClick={() => void run("resume")}>
            <Play aria-hidden="true" size={16} />
          </button>
        ) : null}
        {actions.includes("stop") ? (
          <button type="button" className="icon-button icon-button--danger" aria-label={t("timer.stop")} title={t("timer.stop")} disabled={Boolean(busy)} onClick={() => void run("stop")}>
            <Square aria-hidden="true" size={15} />
          </button>
        ) : null}
      </div>
      <p className="human-timer__error" role={error ? "alert" : undefined}>{error ? t(error) : ""}</p>
    </section>
  );
}
