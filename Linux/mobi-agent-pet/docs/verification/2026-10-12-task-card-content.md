# Task card content — 2026-10-12

## Scope

Remove elapsed time from task cards and the independent Custom Mode editor. Retain task state, per-session context usage and the separate account quota ring. Do not change mode eligibility, double-click/drag handling, outside-click dismissal, pinning or the five-second deadline.

## Changes

- Removed elapsed renderer markup, formatting and the one-second ticker, plus the active preference, mode projection, settings effect and editor switch.
- Custom profile normalization strips old `hudElapsed` values before validation, preserving state choices, context/quota switches, roam interval and approval mode. Existing legacy elapsed preference values are discarded by schema validation.
- HUD width always follows the existing compact geometry, with the existing state/context width adjustments. Shared Dashboard time labels and session timestamps are retained.

## Verification

- New tests failed before implementation for legacy elapsed rendering, editor switch removal and preserving saved custom choices; all passed after implementation.
- Focused suite: 462 passed, no failures.
- Upstream suite: 6,475 passed, 22 skipped, no failures.
- AgentLog suite: 316 passed, no failures.
- Independent read-only review found no substantive defects; reviewer ran 675 targeted tests successfully.
- Private Electron probe `/tmp/mobi-full-card-content-probe.cjs` used isolated configuration, disabled Agent integrations and controlled mouse sampling. No real mouse movement or user configuration writes.
- Native HUD: no elapsed span; Working state and 80% context chip visible; five-second dismissal remains active and snapshot updates do not extend it.
- Native Custom editor: no elapsed switch, 20 switches and all seven states; state/context/quota controls present; saved 300-second roam interval and auto-tools approval mode survived migration.

Probe output: `CARD_CONTENT_PASS`. Native DBus/SSL diagnostics appeared; no JavaScript or assertion failure.
