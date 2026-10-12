# Remove Idle Power Saving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Remove idle power saving while retaining ordinary playback, input, wake recovery and keep-awake.

**Architecture:** Strip retired fields during configuration normalization. Remove the feature branches from renderer, main/IPC, tick and HUD; keep normal behavior and independent system recovery.

**Tech Stack:** Electron, JavaScript, Node tests.

**Spec:** `docs/superpowers/specs/2026-10-12-remove-idle-power.md`

## Global Constraints

- Preserve other uncommitted work and user configuration.
- Keep all seven pet states and independent working keep-awake.

## Review Focus

- Legacy true settings: ignored without profile reset.
- Idle action cycles lasting beyond 5 seconds: continue playback.
- Working/idle/roam drag and child-frame loads: remain responsive.
- System sleep/resume: SVG and eye tracking recover without a power-saving toggle.
- Hidden task card and ring: retain 5-second dismissal and outside-click behavior.

### Task 1: Remove the feature through all runtime layers

**Files:** Modify custom-mode-profile/editor, prefs, app-mode, settings actions/effects/translations, renderer, preload, main, pet-interaction-ipc, tick, session-hud, theme-schema, system-wake-recovery and matching tests under `runtime/clawd`. Update project rules and verification record.

**Interfaces:** Retire lowPowerIdle/lowPowerIdleMode/low-power-idle-paused and preserve remaining public callbacks.

- [x] Write and run failing profile migration, editor and continuous idle playback tests.
- [x] Remove active feature wiring and obsolete tests; preserve system wake and input behavior.
- [x] Run targeted and upstream tests plus private Electron checks for idle/drag/cards/editor.
- [x] Obtain focused independent review and resolve issues.
- [x] Document verification. Leave changes in the current workspace as authorized.
