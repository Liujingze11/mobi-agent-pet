# AgentLog Pet Phase 1 Linux Verification

Verified on 2026-07-29.

## Environment

- OS: Ubuntu 22.04.5 LTS (Jammy Jellyfish)
- Desktop: Ubuntu GNOME
- Display: X11 on `DISPLAY=:1`
- Architecture: x86_64
- Node.js: 22.12.0
- Electron: 41.10.3
- electron-builder: 26.15.3

The host had `/dev/fuse` but did not have `libfuse.so.2` installed. The Ubuntu
Jammy `libfuse2` package was downloaded and extracted under `/tmp`; it was
provided only through `LD_LIBRARY_PATH`. No system package was installed.

## Automated Results

Development single-instance smoke:

```text
$ npm run smoke:linux
{"status":"ok","productName":"AgentLog Pet","windowCount":4,"pid":119665}
```

Phase 1 regression suite:

```text
$ npm run test:phase1
AgentLog: 23 passed, 0 failed
Pinned upstream: 6,238 passed, 0 failed, 22 platform skips
```

Pinned sidecar verification:

```text
$ npm run verify:sidecars -- build:linux
Verified 1 cc-connect-clawd sidecar binary/binaries.
```

The upstream Node downloader could not use this machine's HTTP proxy and timed
out. The same pinned release asset was downloaded with `curl`. Both hashes
matched the runtime manifest before packaging:

```text
9ff7fcd70e61b4198bf6b8a7a4be8930248139e57d1b0a15f75ea193ef7e1e51  cc-connect-clawd-linux-x64.tar.gz
c56a64c69b685a4f9a6751a8556ec7a127929e141de03b6193e813cb8a8aa974  cc-connect-clawd
```

Package build:

```text
$ npm run build:linux
exit 0
```

Native AppImage single-instance smoke through FUSE:

```text
$ LD_LIBRARY_PATH=/tmp/agentlog-libfuse2/lib/x86_64-linux-gnu \
    npm run smoke:linux -- Linux/AgentLog-Pet-0.1.0-x64.AppImage
{"status":"ok","productName":"AgentLog Pet","windowCount":4,"pid":156426}
```

The smoke runner removes `ELECTRON_RUN_AS_NODE` because the verification
harness exports it. A normal desktop session does not set that variable.

## Packages

```text
168420881  Linux/AgentLog-Pet-0.1.0-x64.AppImage
137210596  Linux/AgentLog-Pet-0.1.0-x64.deb
```

Debian metadata:

```text
Package: agentlog-pet
Version: 0.1.0
Architecture: amd64
Maintainer: Liujingze11
Homepage: https://github.com/Liujingze11/agentlog-pet
Description: Your Private AI Agent Work Journal
```

SHA-256:

```text
c5e70ba2032dc8f6349103f9be41ae08744ecf247d6dfecb2a6761f3a527a85b  Linux/AgentLog-Pet-0.1.0-x64.AppImage
2239a36aabef7376528fb920f8eccfe768848769061f970236376655e1d4428a  Linux/AgentLog-Pet-0.1.0-x64.deb
```

## Interaction Record

- PASS, observed: Native AppImage launch created an `AgentLog Pet` 167x167 pet
  window and a branded welcome window. No DevPulse window was created.
- PASS, observed: A second native AppImage launch with the same isolated HOME
  exited with code 0. The existing AgentLog X11 window IDs and count did not
  change.
- PASS, automated: The package exposes one application entry and one upstream
  single-instance lock.
- PASS, automated: Agent Integrations selects the Settings Agents tab, and the
  Codex and Claude Code integration contracts expose diagnostics and management
  actions.
- PASS, automated: Codex and Claude updates publish normalized events, and a
  throwing event subscriber cannot affect pet state.
- PASS, observed: Existing DevPulse React, Electron, and SQLite source remained
  present. All launch checks used isolated HOME and XDG config directories.
- NOT VERIFIED: Exactly one tray icon is visibly rendered by GNOME Shell. A
  separate pre-existing Clawd process was already running in this desktop
  session, so tray observation would be ambiguous.
- NOT VERIFIED: Manual pet dragging and framing under X11/XWayland.
- NOT VERIFIED: Opening Agent Integrations through a tray click.
- NOT VERIFIED: Visual inspection of Codex and Claude detect/install/repair/
  remove rows.
- NOT VERIFIED: A live Codex turn across thinking, tool, permission/input, and
  completion states.
- NOT VERIFIED: A live Claude Code turn across thinking, tool, permission, and
  completion states.
- NOT VERIFIED: Concurrent live Codex and Claude sessions in the Sessions
  dashboard.
- NOT VERIFIED: Closing Settings or Sessions while listeners and tray remain
  active.
- NOT VERIFIED: Quitting the application from the tray.

Phase 1 does not implement project records, dual timers, summaries, reports, or
workspace restoration. Those remain subsequent approved phases.
