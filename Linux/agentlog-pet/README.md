# AgentLog Pet

Your Private AI Agent Work Journal.

AgentLog Pet is a Linux-first desktop pet and local work journal for AI coding
agents. One Electron application combines the pinned Clawd pet runtime with a
project manager for Codex CLI and Claude Code activity.

Phase 2 records projects, paths, Agent events, Agent sessions, and human work
sessions in a local SQLite database. The Manager keeps Agent session time,
Agent wall-clock active time, and human time visibly separate.

## Requirements

- Linux x64
- Node.js 22.12 or newer
- npm
- X11 or XWayland for full pet dragging and cursor tracking

## Development

```bash
npm install
npm run dev
```

Right-click the desktop pet and select **Open AgentLog Manager**. The first
development launch builds and caches an Electron-compatible `better-sqlite3`
binding under `.electron-native/`; Node-based tests continue using the normal
Node binding.

Application data is stored in Electron's user-data directory under
`data/agentlog.db`. Project history survives Manager closure and application
restart.

## Tests

```bash
npm run test:phase2
npm run smoke:linux
npm run smoke:manager
```

## Linux Packages

```bash
npm run fetch:sidecars -- --target linux-x64
npm run verify:sidecars -- build:linux
npm run build:linux
```

Generated AppImage, deb, and unpacked files are written to `Linux/` and are not
tracked by Git. On hosts without `libfuse.so.2`, test the AppImage with:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 npm run smoke:linux -- Linux/AgentLog-Pet-0.1.0-x64.AppImage
APPIMAGE_EXTRACT_AND_RUN=1 npm run smoke:manager -- Linux/AgentLog-Pet-0.1.0-x64.AppImage
```

On Linux, AgentLog uses the desktop's StatusNotifier/AppIndicator tray host
when one is available. If a desktop intentionally has no compatible tray host,
the launcher and second-instance activation remain available for opening the
Manager; no GNOME settings override is required.

Local tray recovery and package-menu verification are recorded in
[the Linux development handoff](docs/verification/2026-09-14-linux-tray-local-handoff.md).
The remaining desktop compatibility matrix is pre-release work and does not
block development of the next product features.

Phase 3 will add summaries, reports, trusted project restore scripts, execution
logs, health checks, and Agent session continuation. Those features are not
part of the current release.
