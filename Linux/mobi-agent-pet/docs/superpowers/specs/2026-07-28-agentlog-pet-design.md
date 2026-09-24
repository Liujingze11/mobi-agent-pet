# AgentLog Pet Product Design

- **Date:** 2026-07-28
- **Status:** Approved
- **Product name:** AgentLog Pet
- **Tagline:** Your Private AI Agent Work Journal
- **Package and repository name:** agentlog-pet
- **Initial platform:** Linux

## 1. Product Definition

AgentLog Pet is a local-first desktop pet and project manager for AI coding
agents. It combines the real-time desktop companion capabilities of
[Clawd on Desk](https://github.com/rullerzhou-afk/clawd-on-desk) with the
existing DevPulse project, timer, session, and reporting features.

The pet is not a manual timer with an animated skin. Its primary state comes
from live coding-agent activity: thinking, tool execution, subagents,
permissions, errors, completion, idle, and sleep. The management GUI turns
those events into durable project records, time tracking, summaries, reports,
and recoverable workspaces.

The product is delivered as one application. Clawd does not run as a second
program or sidecar application.

## 2. Goals

- Reuse and extend Clawd on Desk's proven agent integrations, pet runtime, and
  Linux desktop behavior.
- Support Codex CLI and Claude Code in the first usable release.
- Preserve the complete Clawd feature set as the long-term parity target.
- Identify projects automatically from agent working directories and Git
  metadata.
- Let users add, edit, merge, and rebind projects manually.
- Track AI-agent execution time separately from human work time.
- Store project activity, agent sessions, errors, decisions, and next steps.
- Generate structured session, project, daily, weekly, and monthly summaries.
- Restore a project workspace through trusted scripts, editor launching,
  service startup, and agent-session continuation.
- Keep project data local by default and make external AI summarization
  optional and provider-independent.

## 3. Non-Goals

- AgentLog Pet does not implement a coding agent or replace Codex CLI, Claude
  Code, Git, an editor, or a terminal.
- The first release does not target Windows or macOS.
- The first release does not provide cloud sync or user accounts.
- Mobile access remains read-only when the Clawd mobile companion is brought
  into parity; remote permission approval is not part of the baseline.
- Features added to Clawd after the implementation baseline is pinned are not
  automatically in scope. They can be synchronized in later updates.

## 4. Selected Integration Strategy

Clawd Runtime becomes the desktop-companion foundation. DevPulse management
features are migrated into that runtime as internal modules.

This was selected over:

- Porting Clawd features individually into the current DevPulse runtime, which
  would make complete behavioral parity slow and error-prone.
- Running Clawd and DevPulse as separate applications connected by HTTP or
  WebSocket, which would create duplicate processes, trays, lifecycle rules,
  settings, and updates.

The implementation will pin an upstream Clawd commit before code integration.
Relevant upstream code and assets may be reused and modified under the
authorization confirmed by the project owner.

## 5. Single-Application Model

AgentLog Pet has:

- One installer and application identity.
- One single-instance lock.
- One system tray icon.
- One autostart entry.
- One update flow.
- One user-data directory and database.
- One Electron main-process owner for integrations, sessions, timers, windows,
  and persistence.

The application may create multiple Electron windows:

- `PetWindow`: transparent, always-on-top desktop pet.
- `ManagerWindow`: project and session management GUI.
- `PermissionWindow`: permission bubbles owned by the same application.
- `SessionHUDWindow`: optional compact live-session display.

These are windows of one application, not separately installed or launched
products. Electron may create normal renderer and utility child processes.

On launch, the pet and background listeners start. The management window opens
from the pet or tray. Closing the manager hides it while the pet, listeners,
timers, and database remain active. Choosing Quit stops the whole application.

## 6. Runtime Architecture

```text
Codex CLI / Claude Code / later agents
                  |
                  v
            Agent Adapters
                  |
                  v
       Normalized Agent Event Stream
                  |
                  v
          Session Coordinator
        /       |        |       \
       v        v        v        v
 Pet Runtime  Project   Timers  Summary Queue
       \        |        |        /
        \       v        v       /
         +---- SQLite + IPC -----+
                    |
                    v
              Management GUI
```

### 6.1 Agent Adapters

Each adapter owns one external agent integration and converts source-specific
data into the common event model.

The Codex adapter initially uses official hooks and retains JSONL session
polling as a fallback. The Claude adapter uses command hooks and supported
permission hooks. Both adapters expose:

- Installation, repair, status, and removal diagnostics.
- Event normalization.
- Permission-response capabilities.
- Process and session liveness checks.
- Terminal focus when supported.
- Native session resume when supported.

Later adapters follow the same contract. Source-specific behavior remains
inside the adapter instead of leaking into project, timer, or GUI code.

### 6.2 Normalized Agent Events

Every event contains:

- Stable event ID.
- Agent source.
- Agent session ID.
- Parent/subagent session ID when applicable.
- Timestamp and receive timestamp.
- Working directory.
- Event type.
- Tool or permission metadata where applicable.
- Sanitized display payload.
- Optional reference to the source transcript.

Events are persisted before derived state is updated. Event IDs and source
sequence data deduplicate retries and tolerate delayed or out-of-order input.

### 6.3 Session Coordinator

The coordinator is the single source of truth for live sessions. It:

- Creates, updates, and closes sessions.
- Tracks concurrent sessions and subagents.
- Applies Clawd-compatible state priorities.
- Drives pet state, permission bubbles, HUD, and GUI live state.
- Detects exited processes and orphan sessions.
- Recovers live sessions after application restart.
- Finalizes interrupted sessions without losing their event history.

The retained pet states include idle, thinking, working/typing, building,
single-subagent activity, multi-subagent activity, error, completion/attention,
permission notification, compaction/sweeping, worktree/carrying, sleeping, and
waking.

### 6.4 Pet Runtime

The Clawd pet renderer, theme engine, interactions, and Linux window behavior
are reused as the baseline. Pet state is always derived from the session
coordinator. The old DevPulse manual timer state no longer drives the pet's
primary animation.

Human timer activity may appear as a small status indicator, but it cannot
override a more important agent state such as a permission request or error.

## 7. Project Model

A project represents a durable work context, not just a timer category. It
contains:

- Name, description, status, and optional icon.
- Primary directory and path aliases.
- Git root, remote identity, branch, and worktree metadata.
- Detected language, package manager, and project commands.
- Human work sessions and agent sessions.
- Activity timeline, summaries, decisions, and next steps.
- Restore profiles and restore-run history.

### 7.1 Automatic Resolution

When an agent event includes a working directory, the project resolver:

1. Finds the deepest matching configured project path.
2. Resolves Git roots and known worktree aliases.
3. Uses repository identity to associate additional worktrees when safe.
4. Creates a pending, unconfirmed project when no mapping exists.

The first event is stored even if resolution is incomplete. A pending project
can later be confirmed, renamed, merged, or rebound without losing sessions.

### 7.2 Manual Management

Users can:

- Add a project with a folder picker.
- Add or remove path aliases.
- Edit detected project metadata.
- Merge duplicate automatic projects.
- Move sessions to another project.
- Disable automatic creation for selected paths.
- Archive a project without deleting history.

Missing or moved directories are marked unavailable. Historical records are
never deleted because a path is temporarily inaccessible.

## 8. Dual Time Tracking

Agent and human time are different measurements and are stored separately.

### 8.1 Agent Time

- Starts and ends from normalized agent-session lifecycle events.
- Allows multiple concurrent sessions.
- Stores each session's elapsed time.
- Stores both summed session time and unique wall-clock active time so
  concurrency does not produce misleading project totals.
- Marks abnormal endings and recovered intervals explicitly.

### 8.2 Human Time

- Is manually started, paused, resumed, and stopped.
- Associates one active human work session with one project at a time.
- Survives manager-window closure and application restart.
- Keeps the current DevPulse review fields where useful.

Project dashboards show the two values separately and may provide a combined
view, but never collapse them into one unexplained number.

## 9. Management GUI

The GUI is a work-focused desktop tool with these primary destinations:

- `Overview`: live agents, permission requests, active human timer, today's
  time, and recent completions.
- `Projects`: automatic and manual projects, filters, and health indicators.
- `Sessions`: agent and human sessions with source and project filters.
- `Reports`: session summaries, project summaries, and periodic reports.
- `Agents`: integration status, hook setup, repair, fallbacks, and diagnostics.
- `Pet & Themes`: pet theme, size, interactions, sounds, DND, and mini mode.
- `Settings`: AI providers, storage, retention, startup, notifications, and
  privacy.

Each project has:

- Overview.
- Activity timeline.
- Sessions.
- Summaries and decisions.
- Restore.
- Project settings.

The first screen is the operational interface, not a marketing or onboarding
landing page.

## 10. Project Restore

A restore profile can define:

- Project working directory.
- Editor or application launch commands.
- Ordered start, stop, and health-check steps.
- Environment-variable references.
- Per-step timeout and dependency behavior.
- Preferred agent and native session-resume reference.

The restore sequence is:

1. Validate that the project directory and required commands exist.
2. Display the exact proposed steps.
3. Require trust confirmation for a new or modified script.
4. Open the project and editor.
5. Run startup steps with live output and cancellation.
6. Verify configured health checks.
7. Resume the latest supported agent session.
8. If native resume is unavailable, start a new session with a generated
   context bundle containing the latest summary, decisions, and next steps.

Automatically detected scripts are suggestions and are disabled until accepted.
Changing a trusted command invalidates its trust decision. Secrets are
referenced through environment variables and are not stored in scripts or the
database. Every restore run records its steps, output summary, duration, and
result in the project timeline.

## 11. Persistence

SQLite remains the local source of truth. The schema evolves around:

- `projects`
- `project_paths`
- `agent_sessions`
- `agent_events`
- `manual_sessions`
- `summaries`
- `restore_profiles`
- `restore_steps`
- `restore_runs`
- `settings`

Existing DevPulse projects and work sessions are migrated without resetting or
replacing user history. Database migrations are versioned and create a backup
before destructive schema changes. The previous data directory is detected and
moved or imported into the new AgentLog Pet application identity without
silently discarding records.

Structured events and summaries are retained by default. Full transcript
content is optional and controlled by retention settings. Source transcript
locations may be indexed without duplicating all content.

## 12. Summaries and Reports

Session completion queues a structured summary with:

- Intended goal.
- Completed work.
- Important changed files.
- Problems and errors.
- Solutions and technical decisions.
- Unfinished work.
- Recommended next steps.
- Git and timing metadata.

Project summaries aggregate sessions without rewriting the source event
history. Daily, weekly, and monthly reports use the same structured records.

Summarization uses the existing provider abstraction rather than a hard-coded
model. When no provider is available, the application creates a basic
deterministic summary and retains a retryable AI-summary job. Summarization
failure never blocks event storage, timers, pet state, or project recovery.

Sensitive values are removed before content is sent to an external provider.
Users can review what will be sent and can disable external summarization.

## 13. Failure Handling

- Hook installers merge idempotently and back up user configuration.
- Adapter failure falls back to supported log polling and is visible in
  diagnostics.
- Permission handling falls back to the agent's native terminal when AgentLog
  Pet cannot safely answer.
- Duplicate and out-of-order events do not double-count time.
- Process liveness closes orphan sessions and marks abnormal completion.
- Startup recovery reconciles stored sessions with live processes.
- Missing project paths never delete project history.
- Restore steps support cancel, timeout, dependency-aware stopping, and retry.
- Database writes use transactions; recoverable input can be replayed.
- AI-provider outages only delay AI-generated summaries.
- Manager renderer failure does not stop listeners, timers, or the pet.

## 14. Clawd Capability Parity

The final parity target includes all capabilities present in the pinned Clawd
baseline, including:

- Supported coding-agent adapters and multi-agent coexistence.
- Full animation and state mapping.
- Permission bubbles, global shortcuts, stacking, and native fallback.
- Multi-session dashboard and HUD.
- Terminal focus, process liveness, and startup recovery.
- Theme creation, custom assets, and Codex Pet imports.
- Eye tracking, sleep/wake sequences, click reactions, and drag behavior.
- Mini mode and edge interactions.
- Click-through transparency and position memory.
- Single instance, autostart, DND, sound, tray, and auto-update.
- Multi-display behavior.
- Internationalization.
- Supported quota display.
- Remote SSH integration.
- Read-only mobile/PWA companion and its local-network protections.

Features needed by the core Codex/Claude workflow may be delivered before the
general parity phase.

## 15. Delivery Phases

### Phase 1: Single-App Pet Foundation

- Pin and integrate the Clawd runtime.
- Rename the product and establish one application identity.
- Preserve Linux pet, tray, theme, and window behavior.
- Integrate Codex CLI and Claude Code.
- Support normalized events, multi-session coordination, permission bubbles,
  liveness, and startup recovery.
- Provide a minimal Agents diagnostics view.

### Phase 2: Projects and Dual Timing

- Add the new persistence schema and migrate DevPulse data.
- Implement automatic and manual project management.
- Record event timelines and agent sessions.
- Implement agent and human time tracking.
- Add project, session, and overview GUI views.

### Phase 3: Summaries and Restore

- Add provider-independent session and project summaries.
- Add reports.
- Add restore profiles, trusted execution, logs, and health checks.
- Add native agent resume and context-bundle fallback.

### Phase 4: Full Clawd Parity

- Complete the pinned-baseline capability matrix.
- Add remaining agent adapters and advanced integrations.
- Validate themes, interactions, mini mode, HUD, quota, remote SSH, PWA, i18n,
  updates, and multi-display behavior.

Each phase ends in a runnable version of the same AgentLog Pet application.
The first implementation plan will cover Phase 1. Later phases receive focused
implementation plans before code changes begin.

## 16. Testing Strategy

### Unit Tests

- Agent event normalization.
- Event deduplication and ordering.
- Session state and priority rules.
- Project path and worktree resolution.
- Concurrent agent-time aggregation.
- Human timer recovery.
- Summary input construction and redaction.
- Restore trust and dependency rules.

### Integration Tests

- Hook event to database, session coordinator, pet, and GUI.
- Permission request and fallback.
- Adapter polling fallback.
- Process exit and startup recovery.
- Database migration from current DevPulse data.
- Restore execution, cancellation, timeout, and logging.

### End-to-End Tests

- One application instance and one tray.
- Pet-to-manager navigation.
- Project creation, automatic detection, merge, and rebind.
- Dual timer visibility and persistence.
- Session completion and summary retry.
- Restore preview and execution.

### Linux Validation

X11 and Wayland are tested separately for:

- Transparent windows.
- Click-through regions.
- Dragging and position restoration.
- Permission bubbles.
- Tray behavior.
- Global shortcuts where supported.
- Multi-display sizing and movement.

Real Codex CLI and Claude Code sessions provide final smoke coverage for the
integration paths.

## 17. Acceptance Criteria

The product design is fulfilled when:

- The user installs and launches one application named AgentLog Pet.
- Live Codex and Claude activity drives the pet without manual timer input.
- Permission, failure, completion, subagent, idle, and sleep states are
  represented correctly.
- Automatic and manual project workflows preserve every session.
- Agent time and human time remain separate and recover after restart.
- Every completed agent session produces a durable record and summary state.
- A project can be restored through reviewed scripts and agent continuation.
- Core behavior continues when AI summarization is unavailable.
- The pinned Clawd baseline reaches documented feature parity.
