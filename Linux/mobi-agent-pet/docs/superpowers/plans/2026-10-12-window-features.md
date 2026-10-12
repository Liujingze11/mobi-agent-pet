# Window Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox syntax.

**Goal:** Retire edge pinning and mini display; preserve cross-display size and unchanged fullscreen behavior.

**Architecture:** Strip retired fields and migrate old mini coordinates. Remove application mini runtime and UI/input entries; ordinary clamp rules ignore retired pinning overrides. Fixed modes own cross-display size, including launch sizing.

**Tech Stack:** Electron, JavaScript, Node tests.

**Spec:** `docs/superpowers/specs/2026-10-12-window-features.md`

## Global Constraints

Preserve seven pet states, real drag, cards, Agent approvals, other user changes and artwork. Fullscreen behavior unchanged.

## Review Focus

Old true mini/pin flags; pre-mini startup coordinates; shared drag/theme sizing paths; fullscreen untouched; cards/input under all visible states.

### Task 1: Remove active controls and runtime

**Files:** custom-mode-profile/editor, app-mode, prefs/settings, main/mini, pet-interaction-ipc, preloads/renderers, theme-runtime, menu, visible-margins and matching tests.

- [x] Write failing retirement/migration/policy tests and confirm failures.
- [x] Remove mini runtime and entry wiring, pinning branches and controls; preserve normal input and helper compatibility.
- [x] Apply mode-owned cross-display sizing at launch and update regression expectations.
- [x] Run focused and complete checks, native window/input checks, and independent review.
- [x] Document final behavior and verified limits; retain edits in the current workspace.
