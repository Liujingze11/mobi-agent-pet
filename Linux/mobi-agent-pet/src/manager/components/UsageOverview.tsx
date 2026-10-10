import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useI18n, formatManagerDuration } from "../i18n";
import type { UsageReport } from "../types";

type Props = {
  report: UsageReport;
  period: "day" | "week";
  anchor: number;
  onPeriodChange: (period: "day" | "week") => void;
  onAnchorChange: (anchor: number) => void;
  isRefreshing?: boolean;
  refreshError?: boolean;
  onRefresh?: () => void;
};

function formatTokens(value: number | null | undefined, locale: string, fallback: string) {
  if (value == null) return fallback;
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatActiveDuration(milliseconds: number, locale: string) {
  if (milliseconds > 0 && milliseconds < 60_000) {
    return `${Math.max(1, Math.round(milliseconds / 1000))}${locale === "zh" ? "秒" : "s"}`;
  }
  return formatManagerDuration(milliseconds, locale === "zh" ? "zh" : "en");
}

function formatExactTokens(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(value);
}

export function UsageOverview({ report, period, anchor, onPeriodChange, onAnchorChange, isRefreshing = false, refreshError = false, onRefresh }: Props) {
  const { locale, t } = useI18n();
  const [focusedBar, setFocusedBar] = useState<string | null>(null);
  const maxBucket = Math.max(1, ...report.buckets.map((bucket) => bucket.activeMs));
  const tokenBuckets = report.tokenBuckets || [];
  const maxTokenBucket = Math.max(1, ...tokenBuckets.map((bucket) => bucket.inputTokens + bucket.outputTokens));
  const tokenTotal = report.usage?.inputTokens != null && report.usage?.outputTokens != null
    ? report.usage.inputTokens + report.usage.outputTokens
    : null;
  const bucketLabel = (start: number, end: number) => period === "week"
    ? new Date(start).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", weekday: "short" })
    : `${new Date(start).toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" })} – ${new Date(end).toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" })}`;
  const bucketAxis = (start: number, index: number) => period === "week"
    ? new Date(start).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { weekday: "short" })
    : index % 4 === 0 ? String(new Date(start).getHours()) : "";
  const moveDate = (direction: -1 | 1) => {
    const next = new Date(anchor);
    if (period === "week") next.setDate(next.getDate() + 7 * direction);
    else next.setDate(next.getDate() + direction);
    onAnchorChange(next.getTime());
  };
  const dateLabel = new Date(report.start).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", period === "week"
    ? { year: "numeric", month: "short", day: "numeric" }
    : { year: "numeric", month: "long", day: "numeric" });
  const nextPeriod = new Date(report.start);
  nextPeriod.setDate(nextPeriod.getDate() + (period === "week" ? 7 : 1));
  const rangeLabel = period === "week"
    ? `${dateLabel} – ${new Date(nextPeriod.getTime() - 1).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" })}`
    : dateLabel;
  return (
    <section className="usage-overview" aria-label={t("usage.heading")}>
      <div className="usage-overview__header">
        <div>
          <h2>{t("usage.heading")}</h2>
        </div>
        <div className="usage-overview__controls">
          <div className="segmented-control" aria-label={t("usage.period")}>
            <button type="button" aria-pressed={period === "day"} onClick={() => onPeriodChange("day")}>{t("usage.today")}</button>
            <button type="button" aria-pressed={period === "week"} onClick={() => onPeriodChange("week")}>{t("usage.week")}</button>
          </div>
          <div className="usage-overview__date"><button type="button" aria-label={t("usage.previous")} onClick={() => moveDate(-1)}>‹</button><span>{rangeLabel}</span><button type="button" aria-label={t("usage.next")} disabled={nextPeriod.getTime() > Date.now()} onClick={() => moveDate(1)}>›</button></div>
          {onRefresh ? <button type="button" className="usage-overview__refresh" disabled={isRefreshing} onClick={onRefresh}>
            <RefreshCw aria-hidden="true" size={15} className={isRefreshing ? "usage-overview__refresh-icon--busy" : undefined} />
            {t(isRefreshing ? "usage.refreshing" : "usage.refresh")}
          </button> : null}
        </div>
      </div>
      {refreshError ? <p className="usage-overview__refresh-error" role="alert">{t("usage.refreshError")}</p> : null}

      <div className="usage-overview__hero">
        <div className="usage-overview__total">
          <h3>{t("usage.timeHeading")}</h3>
          <strong>{formatActiveDuration(report.totalMs, locale)}</strong>
        </div>
        <div className="usage-overview__chart" aria-label={t("usage.timeChart")}>
          {report.buckets.map((bucket, index) => {
            const label = bucketLabel(bucket.start, bucket.end);
            const duration = formatActiveDuration(bucket.activeMs, locale);
            const key = `time-${bucket.start}`;
            return <button type="button" className="usage-overview__bar" key={bucket.start} aria-label={`${label}: ${duration}`} aria-describedby={focusedBar === key ? `usage-tooltip-${key}` : undefined} onMouseEnter={() => setFocusedBar(key)} onMouseLeave={() => setFocusedBar(null)} onFocus={() => setFocusedBar(key)} onBlur={() => setFocusedBar(null)}>
              <span className="usage-overview__bar-fill" style={{ height: `${Math.max(bucket.activeMs > 0 ? 4 : 0, Math.round((bucket.activeMs / maxBucket) * 100))}%` }} />
              <small>{bucketAxis(bucket.start, index)}</small>
              {focusedBar === key ? <span className="usage-overview__tooltip" id={`usage-tooltip-${key}`} role="tooltip"><strong>{label}</strong><span>{duration}</span></span> : null}
            </button>;
          })}
        </div>
      </div>

      <div className="usage-overview__hero usage-overview__hero--tokens">
        <div className="usage-overview__total">
          <h3>{t("usage.tokenHeading")}</h3>
          <strong title={tokenTotal == null ? undefined : formatExactTokens(tokenTotal, locale)}>{formatTokens(tokenTotal, locale, t("usage.noData"))}</strong>
          {report.usage?.missingLogSessions ? <small className="usage-overview__coverage">{t("usage.partialData")}</small> : null}
        </div>
        <div className="usage-overview__chart" aria-label={t("usage.tokenChart")}>
          {tokenBuckets.map((bucket, index) => {
            const label = bucketLabel(bucket.start, bucket.end);
            const total = bucket.inputTokens + bucket.outputTokens;
            const exact = formatExactTokens(total, locale);
            const key = `token-${bucket.start}`;
            return <button type="button" className="usage-overview__bar" key={bucket.start} aria-label={`${label}: ${exact}`} aria-describedby={focusedBar === key ? `usage-tooltip-${key}` : undefined} onMouseEnter={() => setFocusedBar(key)} onMouseLeave={() => setFocusedBar(null)} onFocus={() => setFocusedBar(key)} onBlur={() => setFocusedBar(null)}>
              <span className="usage-overview__bar-fill" style={{ height: `${Math.max(total > 0 ? 4 : 0, Math.round((total / maxTokenBucket) * 100))}%` }} />
              <small>{bucketAxis(bucket.start, index)}</small>
              {focusedBar === key ? <span className="usage-overview__tooltip" id={`usage-tooltip-${key}`} role="tooltip"><strong>{label}</strong><span>{exact}</span></span> : null}
            </button>;
          })}
        </div>
      </div>

    </section>
  );
}
