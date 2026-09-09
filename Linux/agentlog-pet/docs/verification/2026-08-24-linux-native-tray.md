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
6333 tests, 6311 pass, 0 fail, 22 skipped; exit 0

node --test test/agentlog/smoke-tray-diagnostics.test.cjs test/agentlog/product-entry.test.cjs test/agentlog/manager-ipc.test.cjs runtime/clawd/test/tray-menu-model.test.js runtime/clawd/test/linux-tray-protocol.test.js runtime/clawd/test/tray-runtime.test.js
74 pass, 0 fail; exit 0

make clean test integration-test
22 protocol tests, 3 main-context tests, and isolated D-Bus integration passed

npm run smoke:linux
{"status":"ok","productName":"AgentLog Pet","windowCount":4,...,"tray":{"status":"native","code":null}}; exit 0

node scripts/smoke-linux.cjs /tmp/.../opt/AgentLog\ Pet/agentlog-pet
{"status":"ok","productName":"AgentLog Pet","windowCount":4,...,"tray":{"status":"native","code":null}}; exit 0

APPIMAGE_EXTRACT_AND_RUN=1 npm run smoke:linux -- Linux/AgentLog-Pet-0.1.0-x64.AppImage
{"status":"ok","productName":"AgentLog Pet","windowCount":4,...,"tray":{"status":"native","code":null}}; exit 0

APPIMAGE_EXTRACT_AND_RUN=1 npm run smoke:manager -- Linux/AgentLog-Pet-0.1.0-x64.AppImage
{"status":"ok","pid":...,"productName":"AgentLog Pet","managerTitle":"AgentLog Pet","databaseName":"agentlog.db","managerShell":true}; exit 0
```

After each development, extracted-deb, AppImage smoke, and AppImage manager
smoke, `pgrep -af 'AgentLog|agentlog-tray'` returned no process. The application
smokes now wait for and expose only the allowlisted tray `status` and `code`;
all three application paths reported `native`. The AppImage smokes exercised
the extracted runtime, its real Electron process lifecycle, the second-instance
manager activation path, and manager-shell metadata.

The final rootless rebuild used `/tmp/agentlog-native-tray-task9/sysroot` with
`PKG_CONFIG_PATH` pointing first at its `usr/lib/x86_64-linux-gnu/pkgconfig` and
`LD_LIBRARY_PATH` only for build/test execution. `pkg-config` reported GTK
3.24.33, Ayatana AppIndicator 0.5.90, and JSON-GLib 1.6.6. `npm run build:linux`
verified the real linux-x64 sidecar, compiled the helper, and built AppImage and
deb without any fake sidecar.

## Artifacts

Current-host diagnosis rebuild at 2026-09-09 10:00-10:07 +0800:

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `AgentLog-Pet-0.1.0-x64.AppImage` | 164283293 | `c63a58b1a7f568a5965bd86080a439fb50e3d718b141c2b97c96ef3ad5a8e3cc` |
| `AgentLog-Pet-0.1.0-x64.deb` | 132625968 | `1c12b9d0d6e87553e90f12207ca2b26ee6c1be604e3ad34a09d73c2ff50e71e2` |

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

The previous fallback was reproduced before the fix: the full development app
created an Electron temporary StatusNotifier item, no `agentlog-tray` process
survived startup, while direct execution of the same helper emitted `ready` and
`host-status` successfully. Tracing the real menu across the boundary found two
contract mismatches: ordinary model entries used `kind: "item"` while the
specified protocol uses `kind: "command"`, and the intentionally disabled
Custom/Edit Custom labels omitted IDs although both validators required one.

The model now emits the canonical kind. JavaScript and C accept a missing ID
only when an entry is explicitly disabled, and the helper does not attach a
command callback to such an entry. The complete model-to-protocol regression
test and native protocol/integration tests cover this boundary.

With the fixed full app alive as PID `23883`, exactly one new watcher item was
registered: `:1.352/org/ayatana/NotificationItem/com_agentlog_pet_tray`. Its
helper PID `23969` was a child of the Electron process. Public properties were:

```text
Id=com.agentlog.pet.tray
Title=AgentLog Pet
Status=Active
IconName=agentlog-pet
IconThemePath=<application>/build/tray/icons/hicolor
Menu=/org/ayatana/NotificationItem/com_agentlog_pet_tray/Menu
```

`com.canonical.dbusmenu.GetLayout` returned revision 3 and the complete menu,
including all three active modes, the disabled custom entries, AgentLog,
Dashboard, settings, pet visibility, and quit. `AboutToShow(0)` completed.
After application shutdown, the watcher returned to its exact baseline list and
no Electron or `agentlog-tray` process remained. Attention switching, clicking
every command, and panel restart are still not claimed as manual desktop proof.

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
| Ubuntu 22.04 GNOME 42 X11 | PARTIAL: extract-and-run application/manager smoke reports native; stable item properties and menu layout observed; direct FUSE unavailable | PARTIAL: isolated smoke reports native; stable item properties and menu layout observed | manual attention/all-command/panel-restart checks remain |
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
external matrix environments remain unavailable; the current X11 row still
lacks manual attention, every-command, and panel-restart evidence.
