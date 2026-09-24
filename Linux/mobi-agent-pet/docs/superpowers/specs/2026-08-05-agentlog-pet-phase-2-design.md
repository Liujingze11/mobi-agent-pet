# AgentLog Pet Phase 2 Design

- **Date:** 2026-08-05
- **Status:** Approved
- **Phase:** Projects and Dual Timing
- **Platform:** Linux

## 1. Objective

Phase 2 turns the Phase 1 desktop pet foundation into a durable local work
journal. AgentLog Pet will recognize projects from Codex and Claude working
directories, let the user manage projects manually, persist agent activity and
sessions, and track agent time separately from human work time.

The application remains one Electron product. The pinned Clawd runtime remains
the sole owner of the application lifecycle, pet, tray, agent integrations, and
agent state. Product-owned AgentLog modules add persistence and project logic,
and a React manager renderer provides the work-focused GUI.

## 2. Decisions

- Use the hybrid architecture approved by the user: Clawd owns the Electron
  runtime, AgentLog owns domain services, and React owns the manager renderer.
- Start with a fresh AgentLog database. Do not discover, read, import, or
  migrate the old DevPulse database.
- Store the new database as `data/agentlog.db` under the AgentLog Pet Electron
  user-data directory.
- Unknown agent working directories create a non-blocking pending project
  immediately. The first event is retained before the user confirms the
  project.
- English is the primary GUI language in Phase 2.
- AI summaries, reports, and workspace restore scripts remain Phase 3 work.

Legacy DevPulse source may be used as reference or selectively adapted, but
its Electron main process, tray, pet, lifecycle, and database are not revived.
Legacy data has no compatibility guarantee and is not deleted automatically by
AgentLog Pet.

## 3. Architecture

```text
Codex CLI / Claude Code
          |
          v
Pinned Clawd agent integrations and session coordinator
          |
          v
AgentLog normalized event stream
          |
          v
Durable event writer transaction
     /          |             \
    v           v              v
Project      Agent session   Activity
resolver     tracker         timeline
     \          |             /
      +---------+------------+
                |
                v
              SQLite
                |
                v
        Validated IPC + preload
                |
                v
         React ManagerWindow
```

The AgentLog service starts after Electron is ready and before agent events are
accepted for durable processing. A normalized event subscriber calls one
transactional ingestion entry point. The event row is inserted first, then the
project and session projections are updated in the same transaction. Duplicate
event IDs are successful no-ops.

The current in-memory event stream remains useful for immediate pet behavior
and diagnostics. SQLite is the durable source of truth for manager views and
time calculations.

## 4. Module Boundaries

### 4.1 Runtime Bootstrap

The product wrapper initializes the AgentLog services without taking ownership
away from Clawd. It provides the database, event ingestion service, human timer,
manager-window controller, IPC handlers, and clean shutdown hooks.

Failure to initialize AgentLog persistence is reported through diagnostics and
prevents recording controls from pretending to work. The pet and Clawd agent
integrations continue operating when that can be done safely.

### 4.2 Persistence

Only the Electron main process opens SQLite. Renderers have no SQL, filesystem,
or Node.js access. The persistence module owns:

- database path creation;
- WAL mode, foreign keys, and busy timeout;
- ordered schema migrations;
- transaction helpers;
- repository functions that return plain serializable values;
- clean close during application shutdown.

`better-sqlite3` becomes a production dependency and is rebuilt for the pinned
Electron version. Packaging includes its native binary and the manager assets.

### 4.3 Project Resolver

The resolver accepts a normalized working directory and optional Git metadata.
It does not read arbitrary file content. Resolution order is:

1. deepest active configured project path;
2. exact canonical Git root or known worktree path;
3. repository identity match when the remote identity is unambiguous;
4. create or reuse a pending project for the canonical working directory.

Existing paths use `realpath` for canonical identity. Missing paths retain a
normalized absolute fallback so historical mappings remain queryable. Linux
path comparison is case-sensitive.

### 4.4 Agent Session Tracker

The tracker projects durable events into one session row per agent and source
session ID. It records parent session relationships, project association,
working directory, start and end times, latest state, transcript reference, and
completion disposition.

The tracker treats working-like states as active intervals and idle,
permission-waiting, completion, error, and end states as interval boundaries.
An explicit session end closes the session. Process liveness or startup
reconciliation may close an abandoned session as `interrupted`. Late events can
extend a session only when their source timestamp is newer than the stored
projection.

### 4.5 Human Timer

The human timer has one global active session. It can start for a confirmed or
pending project, pause, resume, and stop. Every transition is written
immediately. The manager window is not the timer owner.

On application startup, a running or paused human session is restored from the
database. Elapsed time is derived from persisted intervals instead of an
in-memory counter, so manager closure and application restart do not reset it.

## 5. Data Model

All timestamps are stored as UTC epoch milliseconds. IDs are stable text IDs.
User-entered text is trimmed and bounded at the IPC boundary.

### 5.1 Schema Metadata

`schema_migrations`

- `version`
- `applied_at`

### 5.2 Projects

`projects`

- `id`
- `name`
- `description`
- `lifecycle`: `active` or `archived`
- `confirmation`: `pending` or `confirmed`
- `created_source`: `manual` or `agent`
- `created_at`
- `updated_at`

`project_paths`

- `id`
- `project_id`
- `path`
- `canonical_path`
- `kind`: `primary`, `alias`, or `worktree`
- `is_available`
- `git_root`
- `git_remote_identity`
- `git_branch`
- `created_at`
- `updated_at`

Canonical active paths are unique. A project has exactly one primary path and
may have multiple aliases or worktrees.

### 5.3 Agent History

`agent_events`

- normalized event fields from schema version 1;
- `project_id`, nullable only when no usable working directory exists;
- `agent_session_row_id`;
- bounded JSON payload and permission metadata;
- unique normalized event ID.

`agent_sessions`

- `id`
- `agent_id`
- `source_session_id`
- `parent_source_session_id`
- `project_id`
- `cwd`
- `title`
- `started_at`
- `ended_at`
- `latest_state`
- `disposition`: `active`, `completed`, `errored`, or `interrupted`
- `transcript_path`
- `created_at`
- `updated_at`

`agent_active_intervals`

- `id`
- `agent_session_id`
- `project_id`
- `started_at`
- `ended_at`
- `close_reason`

Agent summed time is the sum of session intervals. Agent wall-clock active time
is the union of all project intervals, so concurrent sessions do not inflate
the displayed real elapsed time.

### 5.4 Human History

`human_sessions`

- `id`
- `project_id`
- `status`: `running`, `paused`, or `completed`
- `started_at`
- `ended_at`
- `paused_at`
- `accumulated_pause_ms`
- `notes`
- `created_at`
- `updated_at`

A partial unique index permits at most one `running` or `paused` human session.

## 6. Project Workflows

### 6.1 Manual Add

The user selects a folder, reviews a detected name and Git metadata, optionally
enters a description, and creates the project. The operation rejects a path
already owned by another active project and offers navigation to that project.
No external AI call is required.

### 6.2 Automatic Add

An event from an unknown directory creates a pending project named from the Git
repository or folder. Recording continues without a popup. The Overview and
Projects views show the pending count. Confirmation lets the user edit the name
and description while preserving every attached event and session.

### 6.3 Rebind And Merge

The user can add or remove aliases, change the primary path, and merge a pending
duplicate into a confirmed project. Merge moves paths, sessions, events, and
human sessions in one transaction, then archives the duplicate project.

### 6.4 Archive And Missing Paths

Archiving removes a project from default active lists but keeps all history.
Missing directories are marked unavailable. A missing path never causes an
automatic archive or deletion.

## 7. Timing Semantics

AgentLog Pet displays three separate values:

- **Agent session time:** sum of all agent active intervals, including
  concurrency;
- **Agent active time:** union of agent intervals for real wall-clock activity;
- **Human time:** effective running time of manual human sessions.

Agent activity starts on working-like normalized states such as thinking,
working, typing, building, subagent work, and compaction. Waiting for user
permission is not active execution time. Completion, error, session end, or a
transition to idle closes the current interval.

Human time starts only through an explicit user command. Paused time is
excluded. Starting a timer while one already exists returns the active timer
rather than silently replacing it.

## 8. Manager GUI

The manager is an operational desktop window, not an onboarding or marketing
page. It opens from the pet or tray and hides on close. Its default language is
English.

Primary navigation:

- **Overview:** live agents, current human timer, pending project count, today's
  separated time totals, and recent activity;
- **Projects:** compact project list, folder-based add flow, confirmation state,
  path health, archive filter, and selected-project detail;
- **Sessions:** agent and human sessions with project, source, status, and date
  filters;
- **Agents:** the existing integration diagnostics and management surface;
- **Pet & Themes:** the existing pet customization surface;
- **Settings:** storage location, startup, notification, privacy, and diagnostic
  information available in this phase.

The project detail view contains Overview, Activity, Sessions, and Settings
tabs. A stable top toolbar shows the active human timer and icon controls for
start, pause, resume, and stop. Phase 3 destinations are not shown as disabled
or empty navigation items.

The React renderer may adapt useful old DevPulse components, but product copy,
information architecture, state ownership, IPC, and visual treatment are
rebuilt for AgentLog Pet. The interface uses compact lists and tables, clear
status indicators, Lucide icons, restrained color, and no nested cards.

## 9. IPC Contract

The preload exposes narrow grouped APIs:

- `projects`: list, get, add from folder, update, confirm, archive, add/remove
  path, rebind, and merge;
- `sessions`: list agent sessions, list human sessions, get timeline;
- `humanTimer`: get state, start, pause, resume, and stop;
- `overview`: get snapshot;
- `activity`: subscribe to database-backed change notifications;
- `managerWindow`: show, hide, and focus.

Every mutating handler validates IDs, enum values, text bounds, and paths in
the main process. Notifications carry invalidation scopes or compact snapshots,
not unrestricted database rows.

## 10. Failure Handling

- Database migrations run in transactions. A failed migration is not marked as
  applied.
- Duplicate normalized event IDs do not create duplicate activity or time.
- Out-of-order events do not move stored session state backward.
- Busy or transient database failures are logged and surfaced in diagnostics.
- A missing path keeps history and is shown as `Path unavailable`.
- An agent process that disappears closes its open interval and session as
  `interrupted`.
- Manager renderer failure does not stop the pet, listeners, or timers.
- Invalid renderer input returns a structured error and causes no partial
  write.
- Application shutdown checkpoints human timer state and closes SQLite after
  pending event writes complete.

## 11. Testing

### Unit Tests

- schema migration and repository behavior;
- canonical path and deepest-path resolution;
- Git worktree and remote identity resolution;
- pending project reuse;
- event idempotency and out-of-order projection;
- agent interval boundaries and concurrent interval union;
- human timer transitions and restart recovery;
- IPC validation.

### Integration Tests

- normalized event to event row, project, session, and interval in one flow;
- unknown directory to pending project without losing the first event;
- manual confirmation, rebind, merge, and archive transactions;
- manager preload and IPC contracts;
- database reopening with a running or paused human timer;
- packaged native `better-sqlite3` loading under Electron.

### Linux Verification

- one application and one single-instance lock;
- pet and listeners continue after the manager hides;
- manager opens from the product-owned entry;
- development and packaged AppImage manager launch;
- full AgentLog and pinned-upstream regression suites.

## 12. Acceptance Criteria

Phase 2 is complete when:

- a user can manually add, edit, confirm, rebind, merge, and archive projects;
- an unknown Codex or Claude directory creates a reusable pending project and
  persists its first event;
- project activity and agent sessions survive application restart;
- agent session time and deduplicated wall-clock active time are both correct;
- one human timer can start, pause, resume, stop, and recover after restart;
- the manager shows Overview, Projects, Sessions, Agents, Pet & Themes, and
  Settings as functioning destinations;
- hiding the manager does not stop the pet, event ingestion, or timing;
- development and Linux package verification passes without regressing the
  pinned Clawd runtime.

## 13. Out Of Scope

- old DevPulse database import or migration;
- external AI summarization;
- session, project, daily, weekly, or monthly reports;
- restore profiles, script trust, command execution, health checks, or agent
  resume;
- cloud sync and user accounts;
- Windows and macOS packaging;
- remaining Phase 4 Clawd parity work unrelated to the Phase 2 core workflow.
