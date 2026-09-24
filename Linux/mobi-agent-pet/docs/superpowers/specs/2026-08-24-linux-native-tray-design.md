# Linux Native Tray Reliability Design

- **Date:** 2026-08-24
- **Status:** Approved
- **Platform:** Linux
- **Product:** AgentLog Pet

## 1. Purpose

AgentLog Pet must provide a reliable system-tray entry for downloadable Linux
builds without requiring each user to edit GNOME settings. The tray must keep a
stable brand icon, render the current quick menu, support completion highlighting,
and remain subordinate to the single AgentLog Pet application lifecycle.

The product must also remain usable when a desktop environment has no tray host.
No Linux application can create a GNOME status icon when the desktop deliberately
provides no StatusNotifierItem or AppIndicator host, so "reliable" means:

- eliminate AgentLog's dependence on Electron's temporary GNOME icon files;
- use the standard Linux StatusNotifierItem/AppIndicator integration when a host
  exists;
- detect and report backend failure instead of silently claiming success;
- retain a non-tray route into the application through the desktop launcher,
  manager window, and pet menu.

## 2. Confirmed Failure

The missing icon is not caused by menu simplification or by an invalid brand
asset. On the reproduced Ubuntu GNOME 42 system:

- Electron created a StatusNotifierItem owned by the AgentLog main process;
- `RegisteredStatusNotifierItems` included AgentLog;
- the item reported `Status=Active` and exposed a valid 32x32 PNG;
- GNOME Shell logged `unable to update icon for AgentLog Pet_status_icon_1`;
- assigning the GNOME extension a stable project icon path avoided the error.

Electron uses Chromium's Linux tray backend. On GNOME that backend writes each
image into a newly-created temporary directory, publishes `IconThemePath` and
`IconName`, then removes the previous temporary directory on the next image
change. AgentLog cannot control whether a particular GNOME AppIndicator version
successfully resolves that file handoff.

The per-machine `org.gnome.shell.extensions.appindicator custom-icons` override
used during diagnosis is not a product fix. AgentLog must not write that setting
on installation or startup.

## 3. Chosen Approach

AgentLog will use an AgentLog-owned native Ayatana AppIndicator helper as the
primary tray backend on Linux. The helper publishes stable icon names and a
stable icon-theme path from packaged resources. It does not use Electron's
temporary `status_icon_*.png` files.

Electron's existing `Tray` implementation remains a fallback when the helper is
missing, incompatible, or fails to start. Exactly one backend may own a visible
tray item at a time.

Rejected alternatives:

- **GNOME `gsettings` customization:** mutates user-global desktop configuration,
  is GNOME-specific, can mask failures, and prevents dynamic tray highlighting.
- **Repeated `tray.setImage()` retries only:** may reduce startup failures but
  still relies on Chromium temporary files and cannot guarantee recovery after
  shell or extension reloads.
- **A full custom JavaScript StatusNotifierItem implementation:** avoids a native
  helper but duplicates AppIndicator and DBusMenu protocol behavior and creates a
  larger long-term maintenance surface.
- **Upgrading Electron alone:** the current Chromium implementation still uses
  temporary icon files on GNOME, so an upgrade is useful maintenance but not the
  solution to this failure class.

## 4. Architecture

```text
AgentLog Electron main process
  |
  | JSON Lines over private stdin/stdout pipes
  v
agentlog-tray Linux helper
  |
  | libayatana-appindicator3 + GTK3
  v
StatusNotifierItem / AppIndicator host
  |
  +-- Ubuntu GNOME AppIndicator extension
  +-- KDE Plasma status area
  +-- XFCE indicator plugin
```

The helper is a background implementation detail. It has no desktop file, no
window, no database access, and no independent startup entry. The Electron main
process starts it, owns it, and terminates it. Users still launch and interact
with one product: AgentLog Pet.

### 4.1 Tray Supervisor

A product-owned JavaScript supervisor owns Linux tray backend selection. It:

- starts the native helper after Electron is ready;
- sends the initial icon, tooltip, and serializable menu snapshot;
- routes helper click events to existing application commands;
- tracks the StatusNotifierWatcher owner and
  `IsStatusNotifierHostRegistered` over the session D-Bus;
- publishes menu and icon updates with monotonically increasing revisions;
- treats malformed helper output as a backend failure;
- waits for a bounded ready handshake;
- restarts an unexpected helper exit with bounded backoff;
- activates the Electron fallback only after the native backend is stopped;
- exposes redacted backend diagnostics to Settings;
- shuts the helper down before the Electron process exits.

The supervisor must never allow both native and Electron tray instances to be
active concurrently.

### 4.2 Serializable Tray Model

`menu.js` currently builds Electron menu templates containing callback functions.
The tray model will be split into:

1. a platform-neutral descriptor tree;
2. a command router keyed by stable command IDs;
3. an Electron adapter for the fallback backend;
4. a native-helper adapter that serializes the same tree.

Supported descriptor fields are intentionally small:

- `id` for actionable items;
- `kind`: `command`, `checkbox`, `radio`, `submenu`, or `separator`;
- localized `label`;
- `enabled` and `checked` where applicable;
- child `items` for submenus.

No callback source, file path, shell command, or arbitrary object crosses the
helper boundary. The parent remains the authority for mode changes, settings,
window actions, update actions, and quit behavior.

### 4.3 Native Helper

The helper will be a small C program linked to GTK3 and
`libayatana-appindicator3`. It will:

- initialize GTK without creating an application window;
- set a stable application-specific indicator ID;
- set the packaged icon-theme path once;
- switch icons by stable names, such as `agentlog-pet` and
  `agentlog-pet-attention`;
- rebuild its GTK menu from validated parent messages;
- emit a menu-opened event so the parent can stop an active attention flash;
- emit only predefined command IDs on activation;
- report `ready`, recoverable errors, and fatal errors as JSON Lines;
- exit on parent EOF, explicit shutdown, or parent death;
- avoid filesystem, network, project, Agent, and settings access.

Input limits include a maximum message size, menu depth, item count, label length,
and command ID length. Unknown message types and stale revisions are rejected.

### 4.4 Stable Icon Resources

Linux packages will include a private hicolor-compatible icon-theme directory:

```text
resources/tray-icons/hicolor/
  16x16/status/agentlog-pet.png
  16x16/status/agentlog-pet-attention.png
  22x22/status/agentlog-pet.png
  22x22/status/agentlog-pet-attention.png
  32x32/status/agentlog-pet.png
  32x32/status/agentlog-pet-attention.png
  48x48/status/agentlog-pet.png
  48x48/status/agentlog-pet-attention.png
```

The helper passes the theme root and icon names to Ayatana AppIndicator. It never
copies an icon to `/tmp`, and icon updates never delete a path currently visible
to the desktop host.

The normal icon remains the fixed AgentLog brand icon. Pet/theme selection may
change approved navigation imagery elsewhere, but it does not silently replace
the tray backend's identity. A future product decision may add explicit tray icon
variants through the same stable-name mechanism.

## 5. Protocol

The parent and helper exchange UTF-8 JSON Lines through inherited pipes. Every
message contains `version: 1` and a bounded `revision` where state ordering
matters.

Parent-to-helper messages:

- `init`: product ID, tooltip, icon-theme root, initial icon name, full menu;
- `replace-menu`: full descriptor tree and revision;
- `set-icon`: stable normal or attention icon name and revision;
- `shutdown`: graceful termination request.

Helper-to-parent messages:

- `ready`: protocol version and backend information;
- `host-status`: watcher ownership and host-registration state;
- `menu-opened`: the indicator menu became visible;
- `command`: selected command ID and menu revision;
- `error`: stable error code and bounded diagnostic message;
- `stopped`: graceful shutdown acknowledgement.

The parent ignores stale command events from an older menu revision when the
command no longer exists. Checkbox and radio state is never trusted from the
helper; the parent executes the command, updates application state, and sends a
fresh menu snapshot.

## 6. Backend Lifecycle and Failure Handling

Startup order:

1. Electron reaches `app.whenReady()`.
2. The supervisor validates helper and icon resource paths.
3. The native helper starts with private pipes and no shell interpolation.
4. The parent sends `init` and waits for `ready` within two seconds.
5. The helper probes the session bus and reports `host-status`.
6. Only after `ready` and a registered host is the native backend considered
   active.
7. If startup fails, the helper is terminated and Electron Tray is created as a
   fallback.

If no StatusNotifier host exists:

- on X11, the helper stops and the Electron fallback is allowed to try its legacy
  `GtkStatusIcon` path;
- on Wayland, AgentLog reports that no tray host is available and does not loop
  between two backends that depend on the same missing service;
- launcher reactivation and the pet menu remain the recovery paths.

Runtime behavior:

- An unexpected helper exit is restarted at most three times with bounded
  backoff.
- During restart, the Electron fallback may be activated only after the old
  helper is confirmed stopped.
- If the watcher owner or host-registration state changes, the helper re-registers
  once and reports the resulting state; repeated D-Bus changes are debounced.
- After the restart budget is exhausted, the fallback remains active and
  diagnostics records the native backend failure.
- Tray failure never stops project detection, recording, timing, summaries,
  Agent integrations, the pet, or the manager.
- Relaunching AgentLog from the desktop launcher focuses or opens the manager,
  even when no tray host exists.
- Hiding the pet is allowed only because launcher reactivation remains a tested
  recovery route; no critical command is tray-only.

Shutdown behavior:

- The supervisor sends `shutdown`, closes stdin, and waits briefly for exit.
- A helper that does not exit is terminated.
- The helper uses a parent-death signal where available and always exits on EOF.
- No orphan helper may retain a stale tray item after AgentLog exits.

## 7. Packaging

The helper is built for each supported Linux architecture and included as an
unpacked executable resource. Initial release support remains x64, matching the
current AppImage and Debian targets.

For Debian packages:

- declare compatible GTK3 and Ayatana AppIndicator runtime dependencies;
- install the helper executable with AgentLog resources;
- install or package stable hicolor icons without overwriting unrelated icons.

For AppImage:

- include the helper and required compatible shared libraries that are not
  guaranteed by the AppImage baseline;
- launch the helper with a private, explicit library path;
- verify on supported distributions that bundled libraries do not replace the
  host desktop's GTK modules globally.

Build tooling verifies helper architecture, executable permissions, linked
libraries, protocol version, and required icon files before producing an
artifact. Source, build instructions, license notices, and reproducible checksums
remain in the repository.

## 8. User Experience and Diagnostics

There is no new normal-path UI. When the native backend works, users see the same
AgentLog icon and quick menu.

Settings diagnostics reports one of:

- Native tray active;
- Electron tray fallback active;
- No tray host detected;
- Tray backend failed, with a safe error code.

"Native tray active" means that the helper is ready and a host is registered. It
does not claim that an arbitrary third-party panel rendered every pixel; the
stable icon path removes the reproduced AgentLog failure, while the desktop host
remains outside the application's process boundary.

Diagnostics must not expose home paths, temporary paths, DBus unique names, or
raw helper stderr. A tray warning appears only when the user opens diagnostics or
when all tray backends fail and the pet is hidden; it must not become a recurring
notification.

AgentLog will not install a GNOME Shell extension, modify AppIndicator extension
preferences, restart GNOME Shell, or ask users to run desktop-specific repair
commands during normal setup.

## 9. Testing

Automated coverage:

- descriptor validation, localization, separators, nested menus, and command
  routing;
- native and Electron adapters render equivalent menu state;
- protocol framing, message limits, invalid JSON, unknown commands, stale
  revisions, and partial lines;
- watcher owner changes, host registration changes, debouncing, X11 legacy
  fallback, and Wayland no-host behavior;
- helper startup timeout, malformed handshake, crash restart, restart budget,
  fallback activation, and clean shutdown;
- exactly one backend active during every transition;
- normal/attention icon switching preserves stable paths;
- mode changes continue to suppress tray highlighting where required;
- launcher reactivation opens the manager without a tray;
- package manifests include the helper, icons, libraries, and notices;
- a DBus integration harness verifies StatusNotifierItem registration and menu
  activation under an isolated session bus.

Release candidates must be manually verified using clean user profiles with no
AgentLog `custom-icons` override:

| Distribution/Desktop | Session | Package |
| --- | --- | --- |
| Ubuntu 22.04 / GNOME 42 | X11 | Debian and AppImage |
| Ubuntu 22.04 / GNOME 42 | Wayland | Debian and AppImage |
| Ubuntu 24.04 / GNOME 46 | Wayland | Debian and AppImage |
| KDE Plasma 6 | Wayland | AppImage |
| XFCE 4 | X11 | AppImage |

For every matrix entry, verify first launch, application restart, Shell/panel
restart where supported, normal-to-attention icon changes, menu rebuilds, helper
crash recovery, application shutdown, and launcher recovery with the pet hidden.

## 10. Rollout

Implementation is split into reviewable stages:

1. Extract the serializable tray model and command router while retaining the
   current Electron backend.
2. Add the supervised helper protocol and fake-helper tests behind a development
   flag.
3. Implement and package the native Ayatana helper and stable icons.
4. Run the desktop/package matrix and make the native backend the Linux default.
5. Keep Electron Tray as a measured fallback until release evidence supports
   removing it.

The temporary local GNOME `custom-icons` override must be removed before manual
verification so it cannot conceal a regression.

## 11. Definition of Done

This work is complete when:

- supported clean Linux systems show the AgentLog tray icon without user desktop
  configuration;
- the tray no longer exposes a Chromium temporary icon path when the native
  backend is active;
- normal and attention icons use stable packaged names and paths;
- menu behavior matches the current approved quick menu;
- backend crashes recover without duplicate icons or orphan processes;
- a missing tray host leaves the application recoverable through the launcher;
- both Debian and AppImage artifacts pass the required desktop matrix;
- project tests, upstream tests, package checks, and Linux smoke tests pass;
- user-facing known limitations describe desktops that intentionally provide no
  tray host.

## 12. References

- Electron Tray API and Linux StatusNotifierItem behavior:
  https://github.com/electron/electron/blob/main/docs/api/tray.md
- Chromium `StatusIconLinuxDbus` temporary-file implementation:
  https://github.com/chromium/chromium/blob/main/chrome/browser/ui/views/status_icons/status_icon_linux_dbus.cc
- Ubuntu AppIndicator/KStatusNotifierItem extension:
  https://github.com/ubuntu/gnome-shell-extension-appindicator
- Prior Electron icon-loading failure with a working tray menu:
  https://github.com/ubuntu/gnome-shell-extension-appindicator/issues/229
