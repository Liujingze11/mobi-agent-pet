#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP_DIR=$(mktemp -d)
INPUT_FIFO="$TMP_DIR/helper-input"
HELPER_OUTPUT="$TMP_DIR/helper-output"
HELPER_ERROR="$TMP_DIR/helper-error"
HOST_OUTPUT="$TMP_DIR/host-output"
HOST_ERROR="$TMP_DIR/host-error"
EOF_OUTPUT="$TMP_DIR/eof-output"
EOF_ERROR="$TMP_DIR/eof-error"
PARENT_INPUT_FIFO="$TMP_DIR/parent-input"
PARENT_HELPER_PID_FILE="$TMP_DIR/parent-helper-pid"
PARENT_OUTPUT="$TMP_DIR/parent-output"
PARENT_ERROR="$TMP_DIR/parent-error"
HELPER_PID=
HOST_PID=
PARENT_PID=
PARENT_HELPER_PID=
WATCHDOG_PID=
PARENT_INPUT_OPEN=false

process_has_not_exited() {
  local pid=$1
  local ignored
  local state

  [[ -r "/proc/$pid/stat" ]] || return 1
  read -r ignored ignored state ignored <"/proc/$pid/stat" || return 1
  [[ "$state" != Z && "$state" != X ]]
}

wait_for_process_exit() {
  local pid=$1
  local deadline=$((SECONDS + 2))

  while process_has_not_exited "$pid"; do
    ((SECONDS < deadline)) || return 1
    sleep 0.05
  done
}

cleanup() {
  local status=$?
  $PARENT_INPUT_OPEN && exec 4>&-
  [[ -z "$WATCHDOG_PID" ]] || kill "$WATCHDOG_PID" 2>/dev/null || true
  [[ -z "$HELPER_PID" ]] || kill "$HELPER_PID" 2>/dev/null || true
  [[ -z "$HOST_PID" ]] || kill "$HOST_PID" 2>/dev/null || true
  [[ -z "$PARENT_PID" ]] || kill "$PARENT_PID" 2>/dev/null || true
  [[ -z "$PARENT_HELPER_PID" ]] || kill "$PARENT_HELPER_PID" 2>/dev/null || true
  [[ -z "$HELPER_PID" ]] || wait "$HELPER_PID" 2>/dev/null || true
  [[ -z "$HOST_PID" ]] || wait "$HOST_PID" 2>/dev/null || true
  [[ -z "$PARENT_PID" ]] || wait "$PARENT_PID" 2>/dev/null || true
  if [[ $status -ne 0 ]]; then
    printf '%s\n' '--- helper stdout ---' >&2
    sed -n '1,80p' "$HELPER_OUTPUT" >&2 2>/dev/null || true
    printf '%s\n' '--- helper stderr ---' >&2
    sed -n '1,80p' "$HELPER_ERROR" >&2 2>/dev/null || true
    printf '%s\n' '--- host stdout ---' >&2
    sed -n '1,80p' "$HOST_OUTPUT" >&2 2>/dev/null || true
    printf '%s\n' '--- host stderr ---' >&2
    sed -n '1,80p' "$HOST_ERROR" >&2 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
  exit "$status"
}
trap cleanup EXIT INT TERM

(sleep 10; kill -TERM "$$" 2>/dev/null || true) &
WATCHDOG_PID=$!

"$ROOT/build/status-notifier-host" >"$HOST_OUTPUT" 2>"$HOST_ERROR" &
HOST_PID=$!
until grep -qx 'READY' "$HOST_OUTPUT" 2>/dev/null; do
  kill -0 "$HOST_PID"
  sleep 0.05
done

mkfifo "$INPUT_FIFO"
"$ROOT/build/agentlog-tray" <"$INPUT_FIFO" >"$HELPER_OUTPUT" 2>"$HELPER_ERROR" &
HELPER_PID=$!
exec 3>"$INPUT_FIFO"

ICON_ROOT=$(realpath -m "$ROOT/icons/hicolor")
printf '%s\n' \
  "{\"version\":1,\"type\":\"init\",\"revision\":7,\"productId\":\"com.agentlog.pet\",\"tooltip\":\"AgentLog Pet\",\"iconThemeRoot\":\"$ICON_ROOT\",\"icon\":\"agentlog-pet\",\"items\":[{\"kind\":\"command\",\"id\":\"settings.open\",\"label\":\"Settings\",\"enabled\":true}]}" >&3

until grep -q '"type":"command"' "$HELPER_OUTPUT" 2>/dev/null; do
  kill -0 "$HELPER_PID"
  kill -0 "$HOST_PID"
  sleep 0.05
done

printf '%s\n' \
  '{"version":1,"type":"replace-menu","revision":8,"items":[{"kind":"command","id":"settings.open","label":"Settings","enabled":true}]}' >&3
printf '%s\n' '{"version":1,"type":"shutdown"}' >&3
exec 3>&-
wait "$HELPER_PID"
HELPER_PID=
wait "$HOST_PID"
HOST_PID=

node - "$HELPER_OUTPUT" "$ROOT" <<'NODE'
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const outputPath = process.argv[2];
const root = process.argv[3];
const { validateHelperMessage } = require(path.join(root, "../../runtime/clawd/src/linux-tray-protocol.js"));
const text = fs.readFileSync(outputPath, "utf8");
const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : [];
const messages = lines.map((line) => validateHelperMessage(JSON.parse(line)));

if (!messages.some((message) => message.type === "ready" && message.backend === "ayatana")) {
  throw new Error("missing ready message");
}
if (!messages.some((message) => message.type === "host-status" && message.watcher && message.registered)) {
  throw new Error("missing registered host-status message");
}
const menuOpened = messages.filter((message) => message.type === "menu-opened");
if (menuOpened.length !== 1) {
  throw new Error(`expected exactly one menu-opened message, got ${menuOpened.length}`);
}
if (!messages.some((message) => message.type === "command" && message.revision === 7 && message.id === "settings.open")) {
  throw new Error("missing settings.open command event");
}
if (!messages.some((message) => message.type === "stopped")) {
  throw new Error("missing stopped message");
}
NODE

if ! timeout --signal=TERM 2s "$ROOT/build/agentlog-tray" \
  </dev/null >"$EOF_OUTPUT" 2>"$EOF_ERROR"; then
  printf '%s\n' 'helper did not exit successfully on stdin EOF' >&2
  exit 1
fi
if [[ -s "$EOF_OUTPUT" ]]; then
  printf '%s\n' 'helper emitted protocol output while exiting on stdin EOF' >&2
  exit 1
fi
printf '%s\n' 'EOF_EXITED'

mkfifo "$PARENT_INPUT_FIFO"
(
  "$ROOT/build/agentlog-tray" \
    <"$PARENT_INPUT_FIFO" >"$PARENT_OUTPUT" 2>"$PARENT_ERROR" &
  child_pid=$!
  printf '%s\n' "$child_pid" >"$PARENT_HELPER_PID_FILE"
  wait "$child_pid"
) &
PARENT_PID=$!
exec 4>"$PARENT_INPUT_FIFO"
PARENT_INPUT_OPEN=true

until [[ -s "$PARENT_HELPER_PID_FILE" ]]; do
  kill -0 "$PARENT_PID"
  sleep 0.05
done
PARENT_HELPER_PID=$(<"$PARENT_HELPER_PID_FILE")
read -r _ _ _ actual_parent _ <"/proc/$PARENT_HELPER_PID/stat"
if [[ "$actual_parent" != "$PARENT_PID" ]]; then
  printf '%s\n' 'parent-death harness did not create the expected process tree' >&2
  exit 1
fi

printf '%s\n' \
  "{\"version\":1,\"type\":\"init\",\"revision\":1,\"productId\":\"com.agentlog.pet\",\"tooltip\":\"AgentLog Pet\",\"iconThemeRoot\":\"$ICON_ROOT\",\"icon\":\"agentlog-pet\",\"items\":[]}" >&4
until grep -q '"type":"ready"' "$PARENT_OUTPUT" 2>/dev/null; do
  kill -0 "$PARENT_HELPER_PID"
  sleep 0.05
done

kill -KILL "$PARENT_PID"
wait "$PARENT_PID" 2>/dev/null || true
PARENT_PID=
if ! wait_for_process_exit "$PARENT_HELPER_PID"; then
  printf '%s\n' 'helper remained alive after its parent exited' >&2
  exit 1
fi
PARENT_HELPER_PID=
exec 4>&-
PARENT_INPUT_OPEN=false
printf '%s\n' 'PARENT_DEATH_EXITED'

if grep -Eq '(CRITICAL|WARNING)' "$HELPER_ERROR" "$EOF_ERROR" "$PARENT_ERROR"; then
  printf '%s\n' 'helper emitted a GLib/GTK warning' >&2
  exit 1
fi

kill "$WATCHDOG_PID" 2>/dev/null || true
wait "$WATCHDOG_PID" 2>/dev/null || true
WATCHDOG_PID=
trap - EXIT INT TERM
rm -rf "$TMP_DIR"
