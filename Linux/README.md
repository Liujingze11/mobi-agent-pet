# AgentLog Pet

Your Private AI Agent Work Journal.

AgentLog Pet is a Linux-first desktop pet and local work journal for AI coding
agents. Phase 1 uses a pinned Clawd runtime for Codex CLI and Claude Code live
activity, permissions, sessions, themes, and Linux desktop behavior.

## Requirements

- Linux x64
- Node.js 22.12 or newer
- npm
- X11 or XWayland for full pet dragging and cursor tracking

## Development

```bash
npm install
CLAWD_SKIP_SIDECAR_FETCH=1 npm run dev
```

## Tests

```bash
npm run test:phase1
```

## Linux Packages

```bash
npm run fetch:sidecars -- --target linux-x64
npm run build:linux
```

The current DevPulse React and SQLite source remains in the repository for the
project manager migration. Project records, dual timers, summaries, reports,
and workspace restoration are delivered by the subsequent approved phases.
