#!/usr/bin/env bash
# Desktop entries keep an invisible owner process for the application's life.
# Manual invocation detaches so callers can close their terminal.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBI_STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/mobi-agent-pet"
mkdir -p "$MOBI_STATE_DIR" || exit 1
MOBI_DEV_LOG="$MOBI_STATE_DIR/dev.log"
printf '[mobi-dev] %s stage=entry pid=%s mode=%s\n' "$(date -Is)" "$$" "${1:-manual}" >>"$MOBI_DEV_LOG"

# Desktop sessions may not have an nvm-managed node/npm on PATH.
if ! command -v npm >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh" >>"$MOBI_DEV_LOG" 2>&1
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Mobi Agent Pet: npm not found. Install Node.js 22.12 or newer." >>"$MOBI_DEV_LOG"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "Mobi Agent Pet" "Node.js/npm 未找到，开发版无法启动。" >/dev/null 2>&1 || true
  fi
  exit 1
fi

cd "$REPO_ROOT" || exit 1
printf '[mobi-dev] %s stage=runtime-resolved node=%s npm=%s\n' "$(date -Is)" "$(command -v node || true)" "$(command -v npm)" >>"$MOBI_DEV_LOG"
# An explicit desktop launch should open the application, including the first
# launch. Automatic/background starts can omit this flag and show only the pet.
export AGENTLOG_OPEN_MANAGER_ON_STARTUP=1
if [ "${1:-}" = "--desktop" ]; then
  exec npm run dev >>"$MOBI_DEV_LOG" 2>&1 </dev/null
fi
# A cached Terminal=true entry can close its PTY before nohup has started.
# Ignore HUP before forking so the worker inherits it without that race.
trap '' HUP
nohup npm run dev >>"$MOBI_DEV_LOG" 2>&1 </dev/null &
exit 0
