#!/usr/bin/env bash
set -euo pipefail

readonly REPOSITORY="https://github.com/rullerzhou-afk/clawd-on-desk.git"
readonly COMMIT="45d388aa661824443cd96779ff0a5d277972bd10"
readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly DESTINATION="${ROOT}/runtime/clawd"

if [[ -e "${DESTINATION}" ]]; then
  printf 'Refusing to overwrite existing runtime: %s\n' "${DESTINATION}" >&2
  exit 1
fi

temporary_directory="$(mktemp -d)"
trap 'rm -rf "${temporary_directory}"' EXIT

git clone --filter=blob:none --no-checkout "${REPOSITORY}" "${temporary_directory}/source"
git -C "${temporary_directory}/source" fetch --depth 1 origin "${COMMIT}"
mkdir -p "${temporary_directory}/snapshot"
git -C "${temporary_directory}/source" archive "${COMMIT}" |
  tar -x -C "${temporary_directory}/snapshot"

mkdir -p "$(dirname "${DESTINATION}")"
mv "${temporary_directory}/snapshot" "${DESTINATION}"

printf '%s\n' \
  '{' \
  '  "upstreamRepository": "https://github.com/rullerzhou-afk/clawd-on-desk.git",' \
  '  "upstreamCommit": "45d388aa661824443cd96779ff0a5d277972bd10",' \
  '  "upstreamVersion": "0.13.0",' \
  '  "importedAt": "2026-07-28"' \
  '}' > "${DESTINATION}/AGENTLOG_UPSTREAM.json"
