import { Pause, Play, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { deriveHumanTimerMs, deriveTimerActions, formatElapsedClock } from "../model.mjs";
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

function commandError(result: HumanTimerCommandResult) {
  if (!result || !("code" in result)) return null;
  if (result.code === "PROJECT_ARCHIVED") return "This project is archived.";
  if (result.code === "PROJECT_NOT_FOUND") return "The selected project is unavailable.";
  return "Timer state changed. Refresh and try again.";
}

export function HumanTimerBar({
  now = Date.now,
  onOpenProjects,
  onTimerChange,
  projects,
  timer,
  timerApi,
}: HumanTimerBarProps) {
  const selectableProjects = useMemo(
    () => projects.filter((project) => project.lifecycle === "active"),
    [projects]
  );
  const [currentTimer, setCurrentTimer] = useState<HumanSession | null>(activeTimer(timer));
  const [selectedProjectId, setSelectedProjectId] = useState(selectableProjects[0]?.id || "");
  const [busy, setBusy] = useState<TimerAction | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      const resultError = commandError(result);
      if (resultError) {
        const authoritativeTimer = result && "code" in result ? activeTimer(result.state) : null;
        setCurrentTimer(authoritativeTimer);
        onTimerChange(authoritativeTimer);
        setTick(now());
        setError(resultError);
        return;
      }
      const nextTimer = activeTimer(result);
      setCurrentTimer(nextTimer);
      onTimerChange(nextTimer);
      setTick(now());
    } catch {
      setError("Unable to update the timer.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="human-timer" aria-labelledby="human-timer-title">
      <div className="human-timer__identity">
        <span id="human-timer-title">Human timer</span>
        <strong>{currentTimer?.projectName || "No project selected"}</strong>
      </div>
      <output className="human-timer__clock" aria-live="off">{elapsed}</output>
      <div className="human-timer__controls">
        {actions.includes("start") && selectableProjects.length > 0 ? (
          <select
            aria-label="Timer project"
            disabled={Boolean(busy)}
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
          >
            {selectableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        ) : null}
        {actions.includes("start") && selectableProjects.length === 0 ? (
          <button type="button" className="command-button" onClick={onOpenProjects}>Add project</button>
        ) : null}
        {actions.includes("start") && selectableProjects.length > 0 ? (
          <button type="button" className="icon-button icon-button--primary" aria-label="Start timer" title="Start timer" disabled={Boolean(busy)} onClick={() => void run("start")}>
            <Play aria-hidden="true" size={16} />
          </button>
        ) : null}
        {actions.includes("pause") ? (
          <button type="button" className="icon-button" aria-label="Pause timer" title="Pause timer" disabled={Boolean(busy)} onClick={() => void run("pause")}>
            <Pause aria-hidden="true" size={16} />
          </button>
        ) : null}
        {actions.includes("resume") ? (
          <button type="button" className="icon-button icon-button--primary" aria-label="Resume timer" title="Resume timer" disabled={Boolean(busy)} onClick={() => void run("resume")}>
            <Play aria-hidden="true" size={16} />
          </button>
        ) : null}
        {actions.includes("stop") ? (
          <button type="button" className="icon-button icon-button--danger" aria-label="Stop timer" title="Stop timer" disabled={Boolean(busy)} onClick={() => void run("stop")}>
            <Square aria-hidden="true" size={15} />
          </button>
        ) : null}
      </div>
      <p className="human-timer__error" role={error ? "alert" : undefined}>{error || ""}</p>
    </section>
  );
}
