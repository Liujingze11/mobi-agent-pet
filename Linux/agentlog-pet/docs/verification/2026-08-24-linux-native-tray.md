# Linux Native Tray Verification - 2026-08-24

## Status

`DONE_WITH_CONCERNS`: development, extracted-deb, and AppImage
extract-and-run smoke evidence was observed on Ubuntu 22.04 GNOME 42 X11. The
explicit desktop matrix gate remains open because four required desktop/session
environments are unavailable. Direct FUSE-based AppImage launch also remains
unavailable on this host because it lacks `libfuse.so.2`.

## Host and profile

- Ubuntu 22.04.5 LTS, GNOME 42, X11; `DISPLAY=:1`.
- `gsettings get org.gnome.shell.extensions.appindicator custom-icons` returned
  `@a(sss) []` before verification. No AgentLog override was installed.
- All smoke/live launches used a newly created `HOME` plus an isolated XDG
  config directory. The deb was extracted under `/tmp`; it was not installed.

## Commands and results

```text
npm run test:phase2
6331 tests, 6309 pass, 0 fail, 22 skipped; exit 0

node --test runtime/clawd/test/linux-tray-supervisor.test.js runtime/clawd/test/tray-runtime.test.js
25 pass, 0 fail; exit 0

npm run smoke:linux
{"status":"ok","productName":"AgentLog Pet","windowCount":4,...}; exit 0

node scripts/smoke-linux.cjs /tmp/.../opt/AgentLog\ Pet/agentlog-pet
{"status":"ok","productName":"AgentLog Pet","windowCount":4,...}; exit 0

APPIMAGE_EXTRACT_AND_RUN=1 npm run smoke:linux -- Linux/AgentLog-Pet-0.1.0-x64.AppImage
{"status":"ok","productName":"AgentLog Pet","windowCount":4,...}; exit 0

APPIMAGE_EXTRACT_AND_RUN=1 npm run smoke:manager -- Linux/AgentLog-Pet-0.1.0-x64.AppImage
{"status":"ok","pid":...,"productName":"AgentLog Pet","managerTitle":"AgentLog Pet","databaseName":"agentlog.db","managerShell":true}; exit 0
```

After each development, extracted-deb, AppImage smoke, and AppImage manager
smoke, `pgrep -af 'AgentLog|agentlog-tray'` returned no process. The AppImage
smokes exercised the extracted runtime, its real Electron process lifecycle,
the second-instance manager activation path, and manager-shell metadata. They
did not observe a tray host, native diagnostic state, or native UI interaction.

The rootless build used `/tmp/agentlog-native-tray-task8-takeover/sysroot` with
`PKG_CONFIG_PATH` pointing first at its `usr/lib/x86_64-linux-gnu/pkgconfig` and
`LD_LIBRARY_PATH` only for build/test execution. `pkg-config` reported GTK
3.24.33, Ayatana AppIndicator 0.5.90, and JSON-GLib 1.6.6. `npm run build:linux`
verified the real linux-x64 sidecar, compiled the helper, and built AppImage and
deb without any fake sidecar.

## Artifacts

Final Task 9 rebuild at 2026-09-02 08:19-08:20 +0800:

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `AgentLog-Pet-0.1.0-x64.AppImage` | 164279190 | `c247e7e8dc86e793a30d9dec07e6fb4843f4746aabbf6e83a04bc6d38da07855` |
| `AgentLog-Pet-0.1.0-x64.deb` | 132647240 | `82a8873980c6717d9469eafbdb20dbf0045ec781c468501dfd27af14413a1670` |

`dpkg-deb -I` reported `Architecture: amd64` and dependencies including
`libayatana-appindicator3-1` and `libjson-glib-1.0-0`. AppImage extraction and
deb extraction both contained `resources/tray/bin/agentlog-tray` mode `0755`,
eight icons (normal and attention at 16, 22, 32, 48), `NOTICE`, and a
`SHA256SUMS` manifest that verified 15 regular payload files. Both contained
exactly these real library families plus relative SONAME links:

```text
libayatana-appindicator3.so.1.0.0  libayatana-indicator3.so.7.0.0
libdbusmenu-glib.so.4.0.12         libdbusmenu-gtk3.so.4.0.12
libjson-glib-1.0.so.0.600.6
```

The helper was ELF64 little-endian x86-64 with `RUNPATH [$ORIGIN/../lib]` and
no RPATH. `ldd` resolved the five bundled families from the extracted package.

## Live evidence and limits

The extracted deb produced a new StatusNotifierWatcher registration
`:1.246/StatusNotifierItem` under an isolated profile and exited cleanly when
its reported application PID was terminated; no `agentlog-tray` remained.
Direct protocol execution of the packaged helper emitted `ready` with backend
`ayatana` and `host-status` with `watcher:true, registered:true` using its
packaged icon root. The full app's native diagnostic status, stable icon/theme
property, menu rebuild, attention transition, and manual menu clicks were not
automatically observable; Electron emitted duplicate StatusNotifier export
messages and no helper remained at the observation point. They are not claimed
as live native success.

Direct FUSE-based AppImage execution was blocked before app startup by
`dlopen(): error loading libfuse.so.2`. With `APPIMAGE_EXTRACT_AND_RUN=1`, the
same AppImage completed the packaged smoke and manager smoke above. This is
runtime evidence for AppImage extraction mode, not evidence of direct FUSE
mounting or of unobserved native tray UI.

Deterministic supervisor tests cover timeout, malformed output, process exit,
X11 no-host fallback, Wayland no-host diagnostics, three restart delays/cap,
stale-event handling, no duplicate backend, menu-open attention reset, and
graceful helper shutdown. These are unit/harness results, not desktop clicks.

## Matrix

| Desktop/session | AppImage | Extracted deb | Result |
| --- | --- | --- | --- |
| Ubuntu 22.04 GNOME 42 X11 | PARTIAL: extract-and-run application and manager smokes; direct FUSE unavailable and native UI state not observed | PARTIAL: isolated smoke/StatusNotifier registration; native UI state not observed | not a completed row |
| Ubuntu 22.04 GNOME 42 Wayland | NOT RUN | NOT RUN | environment unavailable |
| Ubuntu 24.04 GNOME 46 Wayland | NOT RUN | NOT RUN | environment unavailable |
| KDE Plasma 6 Wayland | NOT RUN | NOT RUN | environment unavailable |
| XFCE 4 X11 | NOT RUN | NOT RUN | environment unavailable |

## Cleanliness and self-review

`rg` found no production `custom-icons`, `org.chromium.*status_icon`, or
`/tmp/org.chromium` dependency. In Task 9 fix round 1, the reviewed-head
smoke shape reproduced the inherited explicit-second-launch anchor failure.
The replacement fixture starts two disposable packaged-process stand-ins,
records the argument arrays, drives first-instance manager activation, and
checks that both processes are gone for successful and failing second launches.

A missing but tested ignored sidecar-preflight module was restored as tracked
source, and stale menu tests now exercise the single tray runtime owner.

Blockers: direct FUSE AppImage launch needs host `libfuse.so.2`; the four
external matrix environments remain unavailable; live native UI/menu/attention
evidence was not observable without fabricating interaction.
