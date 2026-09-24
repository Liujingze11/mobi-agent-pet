# Linux Tray Local Development Handoff

## Scope

The user approved separating local software development from the broader
Linux release matrix. Other desktop/session environments are now pre-release
work, not a blocker for continuing feature development. This report does not
certify every Linux desktop or declare the complete application finished.

Local verification: Ubuntu 22.04 / GNOME 42 / X11. Package probes use a fresh
temporary HOME and XDG config directory, leave the normal profile alone, and
do not install packages or change the desktop's tray configuration.

## Fixes

- GTK radio deselection emitted the previous mode's command before the chosen
  mode. The resulting menu revision change made the intended command stale.
  The helper now ignores radio activation when that radio is not active.
- After helper restart, init could seed revision 11 while the next icon update
  still used revision 5. The helper correctly rejected it and repeatedly exited.
  Both supervisor counters now start from their shared maximum before init.
- Startup timeout and EOF codes did not match the public diagnostic allowlist,
  and helper/spawn errors were omitted. Known failures now retain safe codes;
  arbitrary helper messages and paths still do not cross the public boundary.

The radio integration test failed with an extra `mode.normal` command before
the fix. Both restart-counter tests failed before synchronization. Five of
seven real-supervisor diagnostic cases lost their codes before the fix.

## Fresh Verification - 2026-09-14

| Check | Result |
| --- | --- |
| `npm run test:phase2`, AgentLog Node tests | 186 passed, 0 failed |
| Manager component tests | 34 passed, 0 failed |
| Manager typecheck and production build | passed |
| Upstream tests | 6313 passed, 22 skipped, 0 failed |
| Extracted deb desktop-session probe | all six checks passed; exit 0 |
| AppImage extract-and-run desktop-session probe | all six checks passed; exit 0 |
| AppImage manager smoke | manager shell rendered; `agentlog.db` opened; exit 0 |
| Development application smoke | native tray and second-instance manager activation passed; exit 0 |

The reproducible probe is `native/agentlog-tray/test/packaged-session.cjs`:

```bash
node native/agentlog-tray/test/packaged-session.cjs /path/to/extracted-deb/opt/AgentLog\ Pet/agentlog-pet
APPIMAGE_EXTRACT_AND_RUN=1 node native/agentlog-tray/test/packaged-session.cjs Linux/AgentLog-Pet-0.1.0-x64.AppImage
```

It verifies one native item, stable product identity, the package-owned icon
theme path, eight correctly sized PNG assets, and helper parent ownership.
It invokes real D-BusMenu events for Background -> Normal, Hide -> Show, and
Quit, checks updated menu state, kills only the test application's helper,
observes native recovery, and verifies shutdown restores the watcher baseline.

Recovery checks the exported tray object, not just its bus name. GNOME can
temporarily retain a removed registration; Electron can retain its connection
after destroying the tray object, returning `Method is no longer available`.
Such stale entries are not additional live backends. Timeouts and other
unexpected D-Bus errors remain failures; two live objects remain a failure.
This is sampled D-Bus evidence, not proof of pixel-perfect rendering or of
zero transient cached icons in the desktop panel.

Earlier native verification on 2026-09-10 passed 22 protocol tests, three
main-context tests, and the updated isolated D-Bus radio/command integration,
including EOF and parent-death cleanup. The same helper is in these packages.

## Verified Artifacts

Built on 2026-09-10, runtime-verified again on 2026-09-14. Files are local build
outputs, not published releases. The deb was extracted, not installed.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `AgentLog-Pet-0.1.0-x64.AppImage` | 164283342 | `5ff4fa64a782c45eabd0eec155d04d8d74962f98f7e3155f32b9d885dd7ba94d` |
| `AgentLog-Pet-0.1.0-x64.deb` | 132647912 | `49c28533523821e0e69a8dbd6dbf1969b0dc3d4a5cff2f8b24f242fd5a7d3604` |

Helper SHA-256:
`d166bb7e9d22055988881a24461a9c7a5a62f81e73560f521dde2f893ab85b9c`.

## Review

A separate read-only reviewer examined the code and test changes against
`804f145`, including the packaged-session probe, and reported no findings.
The reviewer did not rerun tests; runtime evidence above was collected by the
implementer. No remote push or release is part of this handoff.

## Pre-Release Work

- Direct FUSE AppImage launch (previously unavailable without `libfuse.so.2`).
- Remaining visual attention, automatic-mode confirmation, every-command,
  panel-restart, and live no-host/fault-injection cases from the original plan.
- Ubuntu 22.04 GNOME Wayland, Ubuntu 24.04 GNOME Wayland, KDE Plasma 6 Wayland,
  and XFCE 4 X11 package/session matrix.

The current fixes do not implement custom-mode editing, Manager translation,
new pets, summaries, reports, or project restore. Those remain product work.
