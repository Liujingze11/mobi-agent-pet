# Usage polish and refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reliable manual recalculation action and improve the two metrics and complete conversation presentation.

**Architecture:** The renderer sends an optional `force` flag through the existing analytics IPC. The usage reader bypasses its parsed-file cache and Codex rollout index for that request. Existing React components render the refreshed report and updated conversation columns.

**Tech Stack:** Electron, Node.js, React, TypeScript, CSS, Vitest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-28-usage-polish-refresh-design.md`

## Global Constraints

- Keep cached input in the Token total.
- Keep the existing local time, date, and week boundaries.
- Preserve the two primary metrics and existing conversation details.
- Bump the version from 0.1.6 to 0.1.7.

## Review Focus

- Repeated clicks while refresh is running trigger one calculation and keep the previous report visible.
- A changed log with unchanged size and mtime is reread for explicit refresh.
- A new Codex rollout becomes visible even inside the normal index lifetime.
- Refresh failure leaves the previous report intact and can be retried.
- Missing per-session Token data reads as unavailable, never as zero.

---

### Task 1: Force recalculation

**Files:** `runtime/agentlog/manager/ipc.cjs`, `runtime/agentlog/analytics/local-usage-reader.cjs`, `src/manager/types.ts`, `test/agentlog/manager-ipc.test.cjs`, `test/agentlog/local-usage-reader.test.cjs`

- [x] Add failing tests for `analytics.get({force:true})` and same-stat log changes.
- [x] Verify those tests fail for the requested behavior.
- [x] Pass the flag through IPC and bypass the reader caches on forced reports.
- [x] Verify the focused tests pass.

### Task 2: Manual refresh interaction

**Files:** `src/manager/App.tsx`, `src/manager/components/UsageOverview.tsx`, `src/manager/i18n.tsx`, `src/manager/__tests__/App.test.tsx`

- [x] Add a failing test for visible refresh, progress, and retained data on failure.
- [x] Verify it fails for the requested behavior.
- [x] Implement the visible button and forced request using the existing request ordering guard.
- [x] Verify the focused test passes.

### Task 3: Screen Time layout and conversation rows

**Files:** `src/manager/components/UsageOverview.tsx`, `src/manager/pages/SessionsPage.tsx`, `src/manager/styles.css`, `src/manager/__tests__/SessionsPage.test.tsx`, `src/manager/__tests__/UsageOverview.test.tsx`

- [x] Add tests for numeric start/end times, Agent, duration and Token columns.
- [x] Verify they fail for the requested behavior.
- [x] Implement the layout, typography, chart grid, responsive list, and detailed row content.
- [x] Verify component tests and visual rendering at the desktop window size.

### Task 4: Release check

**Files:** `package.json`, `package-lock.json`, `CHANGELOG.md`, `README.md`

- [x] Update version and change notes.
- [x] Run focused tests, typecheck, build, full project tests, smoke launch, and `git diff --check`.
