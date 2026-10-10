# Two-Metric Usage Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show only Agent work time and Token usage as primary page sections, with trustworthy period totals.

**Architecture:** Keep tracker events and local usage logs as separate sources. Build confirmed work-time buckets from closed intervals and dated Token buckets from local usage records, then render both with shared period controls. Keep conversation records collapsed for drilldown.

**Tech Stack:** Electron, SQLite, CommonJS, React, TypeScript, node:test, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-two-metric-usage-design.md`

## Global Constraints

- Keep the existing SQLite history.
- Support local Codex and Claude Code sessions.
- Update the application version for this change.

## Review Focus

- An interrupted interval must not count downtime until restart.
- An open interval must not grow the confirmed total indefinitely.
- Overlapping Agent intervals must count once.
- A local Token record must count even when its hook session timestamps missed that period.
- A Token record without a timestamp must not enter a day/week bucket.

---

### Task 1: Confirmed work time

**Files:** `runtime/agentlog/sessions/agent-session-tracker.cjs`, `runtime/agentlog/queries/overview.cjs`, `test/agentlog/overview-queries.test.cjs`, `test/agentlog/agent-session-tracker.test.cjs`

- [ ] Add failing tests for open and interrupted intervals and historical recovery.
- [ ] Read effective ends from observed events; close recovered intervals at the last event.
- [ ] Run the focused node tests.

### Task 2: Dated Token buckets

**Files:** `runtime/agentlog/analytics/local-usage-reader.cjs`, `runtime/agentlog/queries/overview.cjs`, `runtime/agentlog/manager/ipc.cjs`, `test/agentlog/local-usage-reader.test.cjs`, `test/agentlog/overview-queries.test.cjs`

- [ ] Add failing tests for bucket assignment, sessions missed by hooks, and missing logs.
- [ ] Read every tracked local session and aggregate dated usage into the requested boundaries.
- [ ] Run the focused node tests.

### Task 3: Two visible panels

**Files:** `src/manager/App.tsx`, `src/manager/components/UsageOverview.tsx`, `src/manager/pages/SessionsPage.tsx`, `src/manager/styles.css`, `src/manager/i18n.tsx`, `src/manager/types.ts`, manager tests.

- [ ] Add failing UI tests for two panels, both tooltips, and collapsed conversation details.
- [ ] Remove visible project and cost controls; present clear coverage and ongoing-work notes.
- [ ] Run manager tests, typecheck, and build.

### Task 4: Release verification

**Files:** `package.json`, `package-lock.json`, `CHANGELOG.md`, `README.md`

- [ ] Bump version and document the accounting rules.
- [ ] Run `npm run test:phase2` and `git diff --check`.
- [ ] Inspect the running desktop window.
