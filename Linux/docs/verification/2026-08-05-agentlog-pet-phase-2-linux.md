# AgentLog Pet Phase 2 Linux Verification

Verified on 2026-08-12.

## Environment

- Linux x86_64 with X11
- Node.js 22.12.0, ABI 127
- Electron 41.10.3, ABI 145
- electron-builder 26.15.3
- `better-sqlite3` 12.11.1

The host environment had `NODE_TLS_REJECT_UNAUTHORIZED=0`; sidecar integrity
was therefore accepted only after the pinned SHA-256 checks passed.

The host does not provide a verified native FUSE launch path, so final AppImage
smokes used `APPIMAGE_EXTRACT_AND_RUN=1` with isolated HOME and XDG config
directories.

## Automated Results

`npm run test:phase2` completed successfully:

```text
AgentLog Node tests: 145 passed, 0 failed
Manager component tests: 28 passed, 0 failed
Manager TypeScript: passed
Manager production build: passed
Pinned Clawd upstream: 6,239 passed, 22 skipped, 0 failed
```

The pinned Linux sidecar archive and binary matched the source-pinned hashes:

```text
9ff7fcd70e61b4198bf6b8a7a4be8930248139e57d1b0a15f75ea193ef7e1e51  cc-connect-clawd-linux-x64.tar.gz
c56a64c69b685a4f9a6751a8556ec7a127929e141de03b6193e813cb8a8aa974  cc-connect-clawd
```

Development smokes:

```text
{"status":"ok","productName":"AgentLog Pet","windowCount":4,"pid":"<runtime pid>"}
{"status":"ok","pid":"<runtime pid>","productName":"AgentLog Pet","managerTitle":"AgentLog Pet","databaseName":"agentlog.db","managerShell":true}
```

Final AppImage smokes reported the same two successful contracts. The first
also launched a second instance and verified that it exited with code 0. Both
smoke paths terminated the reported runtime PID and left no application process
or listening port behind.

## Native SQLite

Development uses a cached Electron ABI 145 binding without replacing the Node
ABI 127 binding used by tests. Linux packaging copies that verified Electron
binding before electron-builder runs and restores the Node binding afterward.

The packaged native module was found at:

```text
Linux/linux-unpacked/resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

Its SHA-256 matched the Electron cache exactly:

```text
2580cf63a1c121532f8357d41ade06b2871ccc9a975fa1355891e977feb6e8c5
```

The packaged Manager assets and database schema were present in `app.asar`, and
the pinned Linux sidecar was present under `resources/sidecars`.

## Packages

```text
172524426  Linux/AgentLog-Pet-0.1.0-x64.AppImage
140464192  Linux/AgentLog-Pet-0.1.0-x64.deb
```

SHA-256:

```text
3e072d79a06045897a9c0325fde59c3f059716851b62e0d75d63dbf121079bd4  Linux/AgentLog-Pet-0.1.0-x64.AppImage
fa4a02fb2e224ff4204be12a1601863e23ff7807aff1e870748c07023dd37feb  Linux/AgentLog-Pet-0.1.0-x64.deb
```

The Debian desktop entry contains `Name=AgentLog Pet`,
`StartupWMClass=agentlog-pet`, the `Development` category, and the `clawd://`
protocol MIME handler.

## Interaction Coverage

- PASS, automated: one product entry, one upstream lifecycle owner, and one
  single-instance lock.
- PASS, automated: the packaged pet runtime opens and a second launch exits.
- PASS, automated: the packaged Manager renders its shell and opens
  `agentlog.db` through native SQLite.
- PASS, component interaction: manual folder cancellation/add, pending project
  confirmation, project selection, merge/archive controls, timer
  start/pause/resume/stop, and Agent/Human session filters.
- PASS, production Chrome inspection: Manager layouts at 1440x900, 900x620,
  and 500x700 showed readable English content without incoherent overlap.
- PASS, service integration: unknown Codex/Claude directories create pending
  projects while preserving the first durable normalized event.
- NOT VERIFIED with live external tools: a real Codex and Claude session acting
  concurrently against disposable repositories.
- NOT VERIFIED manually on this final artifact: visible GNOME tray count and
  X11 pet dragging.

Phase 3 summaries, reports, restore scripts, execution logs, health checks, and
Agent session continuation are intentionally outside this verification.
