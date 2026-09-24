/** @param {unknown} value */
function usableDuration(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** @param {unknown} milliseconds */
export function formatDuration(milliseconds, labels = { hour: "h", minute: "m" }) {
  const totalMinutes = Math.floor(usableDuration(milliseconds) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}${labels.hour} ${minutes}${labels.minute}` : `${minutes}${labels.minute}`;
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
 * @param {string} [unknownPath]
 */
export function formatPath(input, maxLength = 48, unknownPath = "Unknown path") {
  if (typeof input !== "string" || input.trim() === "") return unknownPath;
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

/** @param {Array<{ confirmation?: string, lifecycle?: string, updatedAt?: number, id?: string }>} projects */
export function sortProjects(projects) {
  return [...projects].sort((left, right) => {
    const lifecycle = Number(left.lifecycle === "archived") - Number(right.lifecycle === "archived");
    if (lifecycle !== 0) return lifecycle;
    const confirmation = Number(left.confirmation !== "pending") - Number(right.confirmation !== "pending");
    if (confirmation !== 0) return confirmation;
    const updated = usableDuration(right.updatedAt) - usableDuration(left.updatedAt);
    return updated || String(left.id || "").localeCompare(String(right.id || ""));
  });
}

/**
 * @param {unknown} value
 * @param {boolean} endOfDay
 */
function localDateBoundary(value, endOfDay) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day + (endOfDay ? 1 : 0));
  if (!endOfDay && (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day)) return null;
  return date.getTime() - (endOfDay ? 1 : 0);
}

/**
 * @param {Array<{ source?: string, projectId?: string | null, disposition?: string, status?: string, startedAt?: number, id?: string }>} sessions
 * @param {{ kind?: string, projectId?: string, status?: string, from?: string, to?: string, direction?: string }} filters
 */
export function filterSessions(sessions, filters = {}) {
  const from = localDateBoundary(filters.from, false);
  const to = localDateBoundary(filters.to, true);
  const direction = filters.direction === "oldest" ? 1 : -1;
  return sessions.filter((session) => {
    if (filters.kind && filters.kind !== "all" && session.source !== filters.kind) return false;
    if (filters.projectId && session.projectId !== filters.projectId) return false;
    const status = session.source === "agent" ? session.disposition : session.status;
    if (filters.status && status !== filters.status) return false;
    const startedAt = typeof session.startedAt === "number" ? session.startedAt : 0;
    if (from !== null && startedAt < from) return false;
    if (to !== null && startedAt > to) return false;
    return true;
  }).sort((left, right) => {
    const started = (usableDuration(left.startedAt) - usableDuration(right.startedAt)) * direction;
    return started || String(left.id || "").localeCompare(String(right.id || ""));
  });
}
