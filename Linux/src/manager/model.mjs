/** @param {unknown} value */
function usableDuration(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** @param {unknown} milliseconds */
export function formatDuration(milliseconds) {
  const totalMinutes = Math.floor(usableDuration(milliseconds) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** @param {string} value */
function pathParts(value) {
  const separator = value.includes("\\") && !value.includes("/") ? "\\" : "/";
  const rootMatch = separator === "\\"
    ? value.match(/^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+\\?)/)
    : value.match(/^\/+?/);
  const root = rootMatch ? rootMatch[0] : "";
  const segments = value.split(/[\\/]+/).filter(Boolean);
  return { separator, root, basename: segments.at(-1) || root || value };
}

/**
 * @param {unknown} input
 * @param {number} [maxLength]
 */
export function formatPath(input, maxLength = 48) {
  if (typeof input !== "string" || input.trim() === "") return "Unknown path";
  const value = input.trim();
  const { separator, root, basename } = pathParts(value);
  if (!Number.isFinite(maxLength) || maxLength <= 0) return basename;
  const limit = Math.max(1, Math.trunc(maxLength));
  if (value.length <= limit) return value;

  const compactRoot = root || "";
  const contextPrefix = `${compactRoot}...${separator}`;
  const candidate = `${contextPrefix}${basename}`;
  if (candidate.length <= limit) return candidate;
  const basenameBudget = limit - contextPrefix.length;
  return basenameBudget > 0 ? `${contextPrefix}${basename.slice(-basenameBudget)}` : basename;
}

/**
 * @param {import("./types").RouteId} route
 * @param {{ pendingProjectCount?: number }} [snapshot]
 */
export function deriveNavigationBadge(route, snapshot = {}) {
  if (route !== "projects") return null;
  const count = snapshot.pendingProjectCount;
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return null;
  const wholeCount = Math.trunc(count);
  return wholeCount > 99 ? "99+" : String(wholeCount);
}

/** @param {{ status?: string } | null | undefined} timer */
export function deriveTimerActions(timer) {
  if (timer?.status === "running") return ["pause", "stop"];
  if (timer?.status === "paused") return ["resume", "stop"];
  return ["start"];
}

/**
 * @param {{ status?: string, startedAt?: number, accumulatedPauseMs?: number, effectiveMs?: number } | null | undefined} timer
 * @param {number} at
 */
export function deriveHumanTimerMs(timer, at) {
  if (!timer) return 0;
  const effectiveMs = usableDuration(timer.effectiveMs);
  if (timer.status !== "running") return effectiveMs;
  const rawStartedAt = timer.startedAt;
  const startedAt = typeof rawStartedAt === "number" && Number.isFinite(rawStartedAt)
    ? rawStartedAt
    : at;
  const pauseMs = usableDuration(timer.accumulatedPauseMs);
  return Math.max(effectiveMs, usableDuration(at - startedAt - pauseMs));
}

/** @param {unknown} milliseconds */
export function formatElapsedClock(milliseconds) {
  const totalSeconds = Math.floor(usableDuration(milliseconds) / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}
