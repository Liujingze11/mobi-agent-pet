# AgentLog Native Linux Tray Helper

This directory contains the GTK 3/Ayatana AppIndicator helper used by AgentLog
Pet on Linux. It accepts protocol-v1 JSON Lines on standard input and writes
bounded protocol messages to standard output. Standard error is reserved for
bounded developer diagnostics.

## Build dependencies

On Debian or Ubuntu, install:

```bash
sudo apt-get install build-essential pkg-config libgtk-3-dev \
  libayatana-appindicator3-dev libjson-glib-dev xvfb dbus-x11
```

The build requires the pkg-config packages `gtk+-3.0`,
`ayatana-appindicator3-0.1`, and `json-glib-1.0`.

## Build and test

From the application root:

```bash
make -C native/agentlog-tray clean test
make -C native/agentlog-tray integration-test
node scripts/build-linux-tray-helper.cjs --development
```

The development executable is `native/agentlog-tray/build/agentlog-tray`.
The Node wrapper stages the packaged executable at
`build/tray/bin/agentlog-tray` and records its digest in
`build/tray/SHA256SUMS`. In a packaged application the helper is available at
`process.resourcesPath/tray/bin/agentlog-tray`.

## Protocol

Each input message is one UTF-8 JSON object followed by a newline. Protocol v1
accepts `init`, `replace-menu`, `set-icon`, and `shutdown`; menu and icon
revisions must be safe nonnegative JavaScript integers. Icons are restricted to
`agentlog-pet` and `agentlog-pet-attention`, and `init.iconThemeRoot` must match
the `icons/hicolor` directory beside the helper's staged `bin` directory.

The helper emits `ready`, `host-status`, `command`, `menu-opened`, `error`, and
`stopped` messages. A `shutdown` request emits `stopped` before exit. Closing
standard input exits without waiting for another message, and Linux parent
death terminates the helper through `PR_SET_PDEATHSIG`.

A minimal shutdown probe under a virtual X server is:

```bash
printf '%s\n' '{"version":1,"type":"shutdown"}' | \
  xvfb-run -a native/agentlog-tray/build/agentlog-tray
```
