# State Mapping

[Back to README](../../README.md)

The desktop pet has exactly seven logical states. Every state plays its enabled actions from the effective action plan, including the default plan before any settings are saved.

| Desktop state | Meaning | Typical input |
| --- | --- | --- |
| `idle` | No active task | No activity or task display ends |
| `roam` | Autonomous movement | Roam starts |
| `working` | Active task | Thinking, tool execution, subagents, compaction, worktree activity |
| `waiting` | Input or confirmation needed | Notification or permission request |
| `complete` | Confirmed task completion | Stop or completion event |
| `error` | Reported task failure | Tool or turn failure |
| `held` | Pet is being lifted | Input window drag; release restores the latest task |

Action filenames do not define states. A sleeping action assigned to `working` still represents working. Empty non-idle slots use the enabled idle actions. Missing saved assets are filtered in memory; saved preferences are preserved.

Mini mode changes clipping, position and hover geometry while retaining the same logical state and action plan. Mouse inactivity and cursor circles do not create sleep or dizzy states. Clicks and file drops do not inject unassigned reaction files. Action previews stay inside the action manager.

Agent hooks and session history retain their original event and state values. At the desktop boundary, `thinking`, `juggling`, `sweeping` and `carrying` map to `working`; `notification` maps to `waiting`; `attention` maps to `complete`. Legacy sleep and mini resource names remain import metadata, rather than additional desktop states.

The hook tables below describe raw Agent inputs. Apply the mapping above to obtain the desktop state; the action plan determines its visual.

## Kimi Code CLI (Kimi-CLI) Hook Events

Kimi Code CLI (Kimi-CLI) now uses hook-only integration (`~/.kimi/config.toml`), and maps these 13 hook events to raw Agent session states:

| Kimi Hook Event | State |
|---|---|
| SessionStart | idle |
| SessionEnd | remove session; idle if no live sessions |
| UserPromptSubmit | thinking |
| PreToolUse | working by default. Explicit payload approval signals (`permission_required` / `requires_approval` / `waiting_for_approval` / `is_permission_request`) always flip the permission animation immediately. Beyond that, the persistent mode decides how permission-gated tools are treated: **`suspect` (installer default)** arms a deferred heuristic — if no `PostToolUse` lands within the suspect window, Kimi is assumed blocked on its approval TUI and the cue fires; `explicit` reacts to explicit signals only (which current kimi-cli never emits — effectively no cues). The installer (`npm run install:kimi-hooks` and the auto-sync at startup) persists the mode as a `--permission-mode=<mode>` flag on the `command` field of `~/.kimi/config.toml`, preserving a previously chosen mode across re-syncs. Runtime env vars override the persisted flag: `CLAWD_KIMI_PERMISSION_MODE=explicit\|suspect` (beats the persisted argv flag; `CLAWD_KIMI_DISABLE_PRETOOL_PERMISSION` and `CLAWD_KIMI_PERMISSION_IMMEDIATE` are checked before it), `CLAWD_KIMI_PERMISSION_IMMEDIATE=1` forces immediate remap for gated tools, `CLAWD_KIMI_PERMISSION_SUSPECT=1` (legacy alias) enables suspect for the current process, `CLAWD_KIMI_PERMISSION_SUSPECT_MS=<ms>` tunes the suspect window, `CLAWD_KIMI_DISABLE_PRETOOL_PERMISSION=1` keeps explicit-only behavior regardless of other switches. Queued gated calls are tracked in a per-session gate ledger: each answered approval re-arms the cue for the next pending one. |
| PostToolUse | working |
| PostToolUseFailure | error |
| Stop | attention |
| StopFailure | error |
| SubagentStart | juggling |
| SubagentStop | working |
| PreCompact | sweeping |
| PostCompact | attention |
| Notification | notification |

## Gemini CLI Hook Notes

Gemini CLI stays on hook-only integration, but two Gemini-native events are intentionally not forced into the raw Claude/Codex semantics:

| Gemini Hook Event | Clawd behavior |
|---|---|
| AfterAgent | Recorded as `AfterAgent` and the session returns to `idle`. It does not remap to shared `Stop`, so Gemini turns do not trigger a completion animation. |
| PreCompress | Recorded as `PreCompress` in session history, but does not add a desktop state; the current task display stays in place. |

## Pi Extension Events

Pi uses a global extension (`~/.pi/agent/extensions/clawd-on-desk`) and maps interactive-session lifecycle events to raw Agent session states:

| Pi Extension Event | Clawd Event | State |
|---|---|---|
| session_start | SessionStart | idle |
| before_agent_start | UserPromptSubmit | thinking |
| tool_call | PreToolUse | working |
| tool_result (ok) | PostToolUse | working |
| tool_result (isError) | PostToolUseFailure | error |
| agent_end | Stop | attention |
| session_before_compact | PreCompact | sweeping |
| session_compact | PostCompact | attention |
| session_shutdown | SessionEnd | remove session; idle if no live sessions |

Pi is state-only in Clawd: Clawd does not intercept permissions or add confirmation prompts, so Pi keeps its default YOLO execution behavior.

## Display and playback lifecycle

A plain single click has no menu action, and right-click is suppressed. Hold and move the left button to drag. Double-click reveals task cards when enabled by the mode and visible data is available, along with enabled quota rings that have data. Mini mode keeps click-to-exit, and Ctrl/Cmd-click still opens the overview. Settings remain accessible through the tray menu.

The main process owns the held lock and completion/error display deadlines. Renderer action frames include state, theme generation and state revision; stale frames and files outside the active slot are rejected. Changing a role or action plan invalidates previous frames and timers. Low-power pause/resume changes playback only.

## Mode policy

| Mode | Pet display | Available states | Alerts and approvals |
| --- | --- | --- | --- |
| Normal | Visible | All seven | Bubbles, HUD and tray alerts enabled; manual approvals |
| Background | Hidden | No visible playback | Agent bubbles and tray alerts on; manual approval; session HUD off |
| Automatic | Visible | Idle, working, waiting, complete, error, held | Agent bubbles and HUD off; tray alerts on; supported requests handled automatically |
| Custom | Separate saved profile | Idle required; other states optional | Configure only in Edit Custom Mode |

Edit Custom Mode opens a standalone compact window from the tray's Mode menu. Boolean features and the seven state choices use sliding switches; idle remains required. The editor is no longer a Settings tab, and Desktop Pet contains only Overview, Actions and Theme.

The first three modes use fixed rules and ignore legacy behavior switches. Automatic disables roam and retains waiting. Normal allows roam when eligible, after at least 120 seconds of idle/rest following a walk. Custom exposes a roaming interval of 10–3600 seconds (default 120) in Edit Custom Mode. Longer idle playback takes priority. Custom configuration is persisted separately; saving does not switch modes or change a preset. Disabled Custom states fall back to idle without changing raw Agent status or work records. Action assignments remain editable in the action manager.

The app offers no sound settings, sound editor or playback. Legacy sound assets and preferences remain for compatibility but are inactive. Each launch starts in Normal. Automatic approvals require consent for the current run. Mode transitions and active Custom profile saves invalidate old approval requests; existing requests are never retroactively approved.

Agent bubbles share one mode switch for approvals, notifications, questions and plan reviews. Cards stack at the bottom-right of the pet's display, use the same Agent palette as the overview, and do not follow the pet. Existing question/approval protocols and their individual timeout rules remain in place.
