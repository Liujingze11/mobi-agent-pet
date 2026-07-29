# Task 1 Report: Pin And Import The Clawd Runtime

## What changed

- Added the executable `Linux/scripts/import-clawd-runtime.sh` importer.
- Added the complete upstream source snapshot under `Linux/runtime/clawd/`.
- Added `Linux/runtime/clawd/AGENTLOG_UPSTREAM.json` with the approved repository, commit, version, and import date.
- Added `Linux/runtime/clawd/UPSTREAM_AGENTLOG.md` documenting the pinned baseline and comparison command.
- Added `Linux/test/agentlog/upstream-pin.test.cjs` to verify the pin and required runtime paths.

The snapshot contains 1,058 files and approximately 48.4 MB of source/assets. It contains no nested `.git` directory.

## Files

- `Linux/scripts/import-clawd-runtime.sh`
- `Linux/runtime/clawd/**/*`
- `Linux/runtime/clawd/AGENTLOG_UPSTREAM.json`
- `Linux/runtime/clawd/UPSTREAM_AGENTLOG.md`
- `Linux/test/agentlog/upstream-pin.test.cjs`

## Test commands and results

1. `node --test test/agentlog/upstream-pin.test.cjs`
   - PASS: 1 test, 1 pass, 0 failures.
2. `node --test runtime/clawd/test/linux-ozone.test.js runtime/clawd/test/agent-runtime-main.test.js runtime/clawd/test/state.test.js`
   - PASS: 298 tests, 298 passes, 0 failures.
3. Snapshot structure checks for `src/main.js`, `AGENTLOG_UPSTREAM.json`, all required pin-test paths, executable importer, and absence of nested `.git` directories.
   - PASS.

## TDD evidence

### RED

After adding only `test/agentlog/upstream-pin.test.cjs`, ran:

```text
node --test test/agentlog/upstream-pin.test.cjs
```

The command exited 1 with the expected error:

```text
ENOENT: no such file or directory, open '.../Linux/runtime/clawd/AGENTLOG_UPSTREAM.json'
```

### GREEN

After adding the importer, importing commit `45d388aa661824443cd96779ff0a5d277972bd10`, and adding the maintenance note, reran the pin test. It exited 0 with 1 pass and 0 failures. The upstream smoke suite also exited 0 with 298 passes and 0 failures.

## Self-review

- Manifest repository is `https://github.com/rullerzhou-afk/clawd-on-desk.git`.
- Manifest commit is `45d388aa661824443cd96779ff0a5d277972bd10`.
- Manifest and upstream package version are both `0.13.0`.
- Import date is `2026-07-28`.
- Importer refuses to overwrite an existing destination.
- Import uses `git archive`, so repository metadata is not copied into the runtime.
- No files outside the requested task scope were changed.

## Concerns

No blocking concerns. The upstream smoke suite emits Node's existing `ExperimentalWarning` for the MockTimers API, but the suite passes completely.

## Commit

Subject: `chore: pin Clawd runtime baseline`
