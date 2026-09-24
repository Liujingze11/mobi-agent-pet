#!/usr/bin/env bash
# Launches Mobi Agent Pet in development mode from the desktop shortcut.
# Desktop environments do not start a login shell, so a nvm-managed
# node/npm is not on PATH — restore it before running npm.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v npm >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm not found. Install Node.js 22.12 or newer, then relaunch." >&2
  read -r -p "Press Enter to close this window."
  exit 1
fi

cd "$REPO_ROOT"
echo "Starting Mobi Agent Pet (dev) from $REPO_ROOT ..."
npm run dev
status=$?

echo ""
if [ "$status" -eq 0 ]; then
  echo "Mobi Agent Pet exited."
else
  echo "Mobi Agent Pet exited with status $status. See the output above."
fi
read -r -p "Press Enter to close this window."
